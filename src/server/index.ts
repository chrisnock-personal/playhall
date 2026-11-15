import http from 'node:http';
import { loadConfig } from './config';
import { createPool, migrate } from './db';
import { Auth } from './auth';
import { RoomManager } from './rooms/manager';
import { RoomSockets } from './ws';
import { createApp } from './http';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createPool(config.databaseUrl);
  // The database container may still be starting: retry for up to a minute.
  for (let attempt = 1; ; attempt++) {
    try { await db.query('SELECT 1'); break; } catch (err) {
      if (attempt >= 30) throw err;
      console.log(`[playhall] waiting for the database (${(err as Error).message})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await migrate(db, config.migrationsDir);

  const auth = new Auth(db, config.jwtSecret, config.allowSignup);
  // The sockets need the manager and the manager reports changes to the
  // sockets, so one is handed to the other through a getter.
  let rooms!: RoomManager;
  const sockets = new RoomSockets(auth, () => rooms);
  rooms = new RoomManager(db, (room) => sockets.changed(room), (room, userId, reason) => sockets.kick(room, userId, reason));

  const app = createApp({ auth, rooms, sockets, db, staticDir: config.staticDir });
  const server = http.createServer(app);
  sockets.attach(server);
  server.listen(config.port, () => console.log(`[playhall] listening on :${config.port}`));

  const stop = () => {
    console.log('[playhall] shutting down');
    server.close(() => db.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error('[playhall] failed to start:', err.message ?? err);
  process.exit(1);
});
