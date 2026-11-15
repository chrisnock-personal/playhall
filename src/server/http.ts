import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Auth } from './auth';
import type { RoomManager } from './rooms/manager';
import type { RoomSockets } from './ws';
import { RoomError } from './rooms/room';
import { gameList } from '../shared/games';

export function createApp(opts: { auth: Auth; rooms: RoomManager; sockets: RoomSockets; staticDir: string }) {
  const { auth, rooms, sockets } = opts;
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
      seatPolicy: b.seatPolicy, guestsCanPlay: typeof b.guestsCanPlay === 'boolean' ? b.guestsCanPlay : undefined,
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

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });

  // The built client. Routing is by #hash, so only index.html is needed.
  if (fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: 'index.html', maxAge: '1h' }));
    app.get(/^\/(?!api|ws).*/, (_req, res) => { res.sendFile(path.join(opts.staticDir, 'index.html')); });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RoomError) { res.status(400).json({ error: err.message }); return; }
    console.error('[http] error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
