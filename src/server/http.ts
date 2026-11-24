import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit, roomPassword, type Auth } from './auth';
import type { RoomManager } from './rooms/manager';
import type { RoomSockets } from './ws';
import { RoomError } from './rooms/room';
import { gameList } from '../shared/games';
import { boardNames, isGameFilter, leaderboard, nameFilter, PERIODS, playerStats, replay } from './stats';
import type { Period } from '../shared/protocol';
import type { Db } from './db';
import { cameraToken, mediaToken, proxyHttp, type MediaConfig } from './media';
import type { Channel } from '../shared/protocol';
import { adminRoutes, type AdminTls } from './admin';
import { reportRoute } from './reports';
import { securityHeaders } from './headers';

/** The LiveKit client's HTTP checks: /rtc/validate or /rtc/v1/validate, nothing else (no dot segments). */
export const isRtcValidate = (p: string) => p === '/rtc/validate' || p === '/rtc/v1/validate';
import { tournamentRoutes, type Tournaments } from './tournaments';
import { loadProgression, progressionBlock } from './progression';
import { getPlatformSettings } from './platform';
import type { PublicPlatform } from '../shared/platform';
import { MAX_WAV_BYTES, SaidLimiter, saidHandler, transcriptsAllowed, whisperTranscribe, whisperUrl } from './transcripts';

export function createApp(opts: { auth: Auth; rooms: RoomManager; sockets: RoomSockets; db: Db; staticDir: string; media?: MediaConfig | null; tls?: AdminTls | null; tournaments?: Tournaments }) {
  const { auth, rooms, sockets, db } = opts;
  const media = opts.media ?? null;
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.set('trust proxy', 'loopback');
  // A certificate chain and key can be bigger than other requests.
  app.use('/api/admin/tls', express.json({ limit: '256kb' }));
  app.use(express.json({ limit: '32kb' }));

  // Voice and video: set up on this server and allowed by the admin.
  const mediaOn = () => !!media && getPlatformSettings().voiceVideoAllowed;
  app.get('/api/health', (_req, res) => { res.json({ ok: true, media: mediaOn(), transcripts: transcriptsAllowed() }); });
  // Platform settings anyone may know (sign-in page, lobby, rooms).
  app.get('/api/platform', (_req, res) => {
    const p = getPlatformSettings();
    const body: PublicPlatform = {
      signupsAllowed: p.signupsAllowed, guestsAllowed: p.guestsAllowed, voiceVideo: mediaOn(),
      transcriptsAllowed: p.transcriptsAllowed, roomDefaults: p.roomDefaults,
    };
    res.json(body);
  });
  app.use('/api', reportRoute({ auth, db, rooms }));
  if (opts.tournaments) app.use('/api', tournamentRoutes({ auth, tournaments: opts.tournaments }));
  app.use('/api/admin', adminRoutes({ auth, db, rooms, sockets, media, tls: opts.tls ?? null }));


  // Transcripts: one utterance of your speech (16 kHz mono WAV), written into
  // the chat as a said line. The audio is dropped once Whisper has read it.
  app.post('/api/rooms/:code/said/:channel', auth.requireUser, rateLimit(120, 60_000),
    express.raw({ type: ['audio/wav', 'audio/x-wav', 'audio/wave'], limit: MAX_WAV_BYTES + 1024 }),
    saidHandler({
      getRoom: (code) => rooms.get(code),
      allowed: transcriptsAllowed,
      transcribe: (wav) => whisperTranscribe(whisperUrl()!, wav),
      limiter: new SaidLimiter(),
    }));

  // Voice and video: a LiveKit token for one channel of a room you're in.
  // The browser connects to LiveKit through this same address (/rtc).
  app.post('/api/rooms/:code/media/:channel', auth.requireUser, rateLimit(30, 60_000), async (req, res) => {
    if (!media) { res.status(503).json({ error: 'Voice and video aren’t set up on this server' }); return; }
    if (!getPlatformSettings().voiceVideoAllowed) { res.status(503).json({ error: 'Voice and video are switched off on this server' }); return; }
    const channel = String(req.params.channel) as Channel;
    if (channel !== 'table' && channel !== 'gallery') { res.status(404).json({ error: 'No such channel' }); return; }
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    const rights = room.mediaRights(req.user!.id);
    if (!rights) { res.status(403).json({ error: 'Join the room first' }); return; }
    const r = rights[channel];
    if (!r.listen) { res.status(403).json({ error: channel === 'gallery' ? 'The gallery is hidden from players during the game' : 'Watchers on a delay can’t hear the table live' }); return; }
    const token = await mediaToken(media, { code: room.rec.code, channel, userId: req.user!.id, name: req.user!.name, ...r });
    res.json({ token, channel, ...r });
  });
  // The table camera (camera table rooms). The host asks for the link for a
  // phone that will film the board: it carries a key for this room and the
  // device id the room keeps. `fresh` makes a new one (cutting off the old
  // device); DELETE stops the camera. The device itself has no account: it
  // swaps the key for a camera-only LiveKit token at /api/camera/token.
  app.post('/api/rooms/:code/table-camera', auth.requireUser, rateLimit(20, 60_000), async (req, res) => {
    if (!mediaOn()) { res.status(503).json({ error: media ? 'Voice and video are switched off on this server' : 'Video isn’t set up on this server' }); return; }
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    if (!room.isHost(req.user!.id)) { res.status(403).json({ error: 'Only the host can make a table camera' }); return; }
    const id = room.tableCameraId(req.body?.fresh === true);
    const key = auth.signCameraKey(room.rec.code, id);
    res.json({ key, path: `#/camera/${room.rec.code}?k=${encodeURIComponent(key)}` });
  });
  app.delete('/api/rooms/:code/table-camera', auth.requireUser, async (req, res) => {
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    if (!room.isHost(req.user!.id)) { res.status(403).json({ error: 'Only the host can stop the table camera' }); return; }
    room.stopTableCamera();
    res.status(204).end();
  });
  app.post('/api/camera/token', rateLimit(30, 60_000), async (req, res) => {
    const k = auth.verifyCameraKey(req.body?.key);
    if (!k) { res.status(403).json({ error: 'This table camera link has expired: ask the host for a new one' }); return; }
    if (!mediaOn()) { res.status(503).json({ error: 'Video is switched off on this server' }); return; }
    const room = await rooms.get(k.code);
    if (!room || !room.isTableCamera(k.cameraId)) { res.status(403).json({ error: 'The host has stopped this table camera or made a new link' }); return; }
    const token = await cameraToken(media!, { code: room.rec.code, cameraId: k.cameraId });
    res.json({ token, room: { code: room.rec.code, name: room.rec.name, game: room.game.describeConfig(room.game.parseConfig(room.rec.settings.gameConfig)) } });
  });
  // Only the two checks the LiveKit client makes over HTTP (#66); everything else is the WebSocket.
  app.get(/^\/rtc(\/.*)?$/, async (req, res) => {
    if (!media) { res.status(404).end(); return; }
    if (!isRtcValidate(req.path)) { res.status(404).end(); return; }
    try { const r = await proxyHttp(media, req.originalUrl); res.status(r.status).type(r.type).send(r.body); }
    catch { res.status(502).json({ error: 'The voice server isn’t answering' }); }
  });
  app.use('/api/auth', auth.routes());
  app.get('/api/games', (_req, res) => { res.json({ games: gameList() }); });
  app.get('/api/progression', auth.requireUser, async (req, res) => {
    res.json(req.user!.guest ? { on: false, ladder: getPlatformSettings().progression, progress: null } : await loadProgression(req.user!.id));
  });

  app.get('/api/rooms', auth.requireUser, async (req, res) => {
    res.json({ rooms: await rooms.list(req.user!.id) });
  });

  app.post('/api/rooms', auth.requireUser, async (req, res) => {
    const b = req.body ?? {};
    if (!req.user!.guest) {
      await loadProgression(req.user!.id);
      const locked = typeof b.gameId === 'string' ? progressionBlock(req.user!.id, b.gameId) : null;
      if (locked) { res.status(403).json({ error: locked }); return; }
    }
    const defaults = getPlatformSettings().roomDefaults;
    const pw = roomPassword(b.password);
    if ('error' in pw) { res.status(400).json({ error: pw.error }); return; }
    const room = await rooms.create(req.user!, {
      passwordHash: pw.password ? await bcrypt.hash(pw.password, 11) : null,
      name: b.name, gameId: b.gameId, listed: typeof b.listed === 'boolean' ? b.listed : undefined,
      seatPolicy: b.seatPolicy, ranked: typeof b.ranked === 'boolean' ? b.ranked : defaults.ranked, guestsCanPlay: typeof b.guestsCanPlay === 'boolean' ? b.guestsCanPlay : undefined,
      gameConfig: b.gameConfig, hostSeat: typeof b.hostSeat === 'string' ? b.hostSeat : null,
      moveSeconds: defaults.moveSeconds, watcherDelay: defaults.watcherDelay,
    });
    res.status(201).json({ room: room.summary() });
  });

  app.get('/api/rooms/:code', auth.requireUser, async (req, res) => {
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    res.json({ room: room.summary() });
  });

  // Private rooms: swap the room password for a pass that opens the room.
  app.post('/api/rooms/:code/pass', auth.requireUser, rateLimit(10, 60_000), async (req, res) => {
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    const hash = room.rec.passwordHash;
    if (!hash) { res.json({ pass: null }); return; }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!(await bcrypt.compare(password, hash))) { res.status(403).json({ error: 'That\u2019s not the room password' }); return; }
    res.json({ pass: auth.signRoomPass(req.user!.id, room.rec.code, hash) });
  });

  // The host sets, changes or removes the password ({ password: null }).
  app.put('/api/rooms/:code/password', auth.requireUser, async (req, res) => {
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    if (!room.isHost(req.user!.id)) { res.status(403).json({ error: 'Only the host can do that' }); return; }
    const pw = roomPassword(req.body?.password);
    if ('error' in pw) { res.status(400).json({ error: pw.error }); return; }
    room.setPassword(pw.password ? await bcrypt.hash(pw.password, 11) : null);
    res.json({ locked: !!pw.password });
  });

  app.delete('/api/rooms/:code', auth.requireUser, async (req, res) => {
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    if (!(await rooms.close(room.rec.code, req.user!.id))) { res.status(403).json({ error: 'Only the host can close the room' }); return; }
    sockets.closeRoom(room);
    res.status(204).end();
  });

  const filters = (q: Record<string, unknown>) => {
    const game = typeof q.game === 'string' ? q.game : 'chess';
    const period = (typeof q.period === 'string' ? q.period : 'all') as Period;
    return isGameFilter(game) && PERIODS.includes(period) ? { game, period } : null;
  };

  app.get('/api/leaderboard', auth.requireUser, async (req, res) => {
    const f = filters(req.query);
    const name = nameFilter(req.query.name);
    if (!f || name === undefined) { res.status(400).json({ error: 'Unknown game or period' }); return; }
    res.json(await leaderboard(db, f.game, f.period, name));
  });

  // Camera table: the game names it has been played under (a tab each).
  app.get('/api/leaderboard/names', auth.requireUser, async (req, res) => {
    const game = typeof req.query.game === 'string' ? req.query.game : '';
    if (!isGameFilter(game) || game === 'all') { res.status(400).json({ error: 'Unknown game' }); return; }
    res.json(await boardNames(db, game));
  });

  app.get('/api/players/:id/stats', auth.requireUser, async (req, res) => {
    const f = filters(req.query);
    const id = String(req.params.id);
    if (!f || !/^[0-9a-f-]{36}$/.test(id)) { res.status(400).json({ error: 'Unknown player, game or period' }); return; }
    const stats = await playerStats(db, id, f.game, f.period);
    if (!stats) { res.status(404).json({ error: 'No such player' }); return; }
    res.json(stats);
  });

  app.get('/api/games/:id', auth.requireUser, async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d+$/.test(id)) { res.status(400).json({ error: 'No such game' }); return; }
    const r = await replay(db, id);
    if (!r) { res.status(404).json({ error: 'Only this game\u2019s result was kept, not its moves, so there\u2019s nothing to replay (the demo data\u2019s older games are like this)' }); return; }
    res.json(r);
  });

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });

  // The built client. Routing is by #hash, so only index.html is needed.
  if (fs.existsSync(opts.staticDir)) {
    // Hashed assets can be cached for good; index.html must always be fresh,
    // or a browser holding an old one asks for assets a new build removed.
    const noCache = (res: Response) => res.setHeader('Cache-Control', 'no-cache');
    app.use(express.static(opts.staticDir, {
      index: 'index.html',
      setHeaders: (res, file) => {
        if (file.endsWith('.html')) noCache(res);
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    app.get(/^\/(?!api|ws|rtc).*/, (_req, res) => { noCache(res); res.sendFile(path.join(opts.staticDir, 'index.html')); });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RoomError) { res.status(400).json({ error: err.message }); return; }
    if ((err as { type?: string }).type === 'entity.too.large') { res.status(413).json({ error: 'Too big' }); return; }
    console.error('[http] error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
