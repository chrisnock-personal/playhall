import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Auth } from './auth';
import type { RoomManager } from './rooms/manager';
import type { RoomSockets } from './ws';
import { RoomError } from './rooms/room';
import { gameList } from '../shared/games';
import { isGameFilter, leaderboard, PERIODS, playerStats } from './stats';
import type { Period } from '../shared/protocol';
import type { Db } from './db';

export function createApp(opts: { auth: Auth; rooms: RoomManager; sockets: RoomSockets; db: Db; staticDir: string }) {
  const { auth, rooms, sockets, db } = opts;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth', auth.routes());
  app.get('/api/games', (_req, res) => { res.json({ games: gameList() }); });

  app.get('/api/rooms', auth.requireUser, async (req, res) => {
    res.json({ rooms: await rooms.list(req.user!.id) });
  });

  app.post('/api/rooms', auth.requireUser, async (req, res) => {
    const b = req.body ?? {};
    const room = await rooms.create(req.user!, {
      name: b.name, gameId: b.gameId, listed: typeof b.listed === 'boolean' ? b.listed : undefined,
      seatPolicy: b.seatPolicy, ranked: typeof b.ranked === 'boolean' ? b.ranked : undefined, guestsCanPlay: typeof b.guestsCanPlay === 'boolean' ? b.guestsCanPlay : undefined,
      gameConfig: b.gameConfig, hostSeat: typeof b.hostSeat === 'string' ? b.hostSeat : null,
    });
    res.status(201).json({ room: room.summary() });
  });

  app.get('/api/rooms/:code', auth.requireUser, async (req, res) => {
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    res.json({ room: room.summary() });
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
    if (!f) { res.status(400).json({ error: 'Unknown game or period' }); return; }
    res.json(await leaderboard(db, f.game, f.period));
  });

  app.get('/api/players/:id/stats', auth.requireUser, async (req, res) => {
    const f = filters(req.query);
    const id = String(req.params.id);
    if (!f || !/^[0-9a-f-]{36}$/.test(id)) { res.status(400).json({ error: 'Unknown player, game or period' }); return; }
    const stats = await playerStats(db, id, f.game, f.period);
    if (!stats) { res.status(404).json({ error: 'No such player' }); return; }
    res.json(stats);
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
    app.get(/^\/(?!api|ws).*/, (_req, res) => { noCache(res); res.sendFile(path.join(opts.staticDir, 'index.html')); });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RoomError) { res.status(400).json({ error: err.message }); return; }
    console.error('[http] error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
