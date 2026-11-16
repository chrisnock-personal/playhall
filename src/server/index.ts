import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { mediaConfigFromEnv } from './media';
import { certFiles, describeCert, ensureCert, replaceCert } from './tls';
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
  const media = mediaConfigFromEnv();
  console.log(`[playhall] voice and video: ${media ? `LiveKit at ${media.url}` : 'off (LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET not set)'}`);
  const sockets = new RoomSockets(auth, () => rooms, media);
  rooms = new RoomManager(db, (room) => sockets.changed(room), (room, userId, reason) => sockets.kick(room, userId, reason));

  const app = createApp({ auth, rooms, sockets, db, staticDir: config.staticDir, media });
  let server: http.Server;
  if (config.tls) {
    const pair = await ensureCert(config.tlsDir, config.tlsHosts);
    const info = describeCert(pair.cert);
    console.log(`[playhall] ${pair.generated ? 'made a self-signed certificate' : 'certificate'}: ${info.subject.replace(/\n/g, ', ')}, ${info.selfSigned ? 'self-signed' : `issued by ${info.issuer.replace(/\n/g, ', ')}`}, until ${info.validTo}, SHA-256 ${info.fingerprint256}`);
    if (info.expired) console.warn('[playhall] the certificate has EXPIRED: browsers will refuse it');
    const secure = https.createServer({ cert: pair.cert, key: pair.key }, app);
    // SIGHUP: reload the certificate files in TLS_DIR (e.g. after copying in a real one).
    process.on('SIGHUP', () => {
      try {
        const f = certFiles(config.tlsDir);
        const next = replaceCert(secure, config.tlsDir, fs.readFileSync(f.cert, 'utf8'), fs.readFileSync(f.key, 'utf8'));
        console.log(`[playhall] certificate reloaded: ${next.subject.replace(/\n/g, ', ')}, until ${next.validTo}`);
      } catch (err) { console.error(`[playhall] certificate NOT reloaded, still serving the old one: ${(err as Error).message}`); }
    });
    server = secure;
  } else {
    server = http.createServer(app);
  }
  sockets.attach(server);
  // With HTTPS, one port answers both: a TLS handshake goes to the HTTPS
  // server, anything else (an old http:// link) gets a redirect to https://.
  const front: net.Server = config.tls ? net.createServer((socket) => {
    socket.once('data', (first) => {
      socket.pause();
      socket.unshift(first);
      (first[0] === 0x16 ? server : redirect).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
    socket.on('error', () => socket.destroy());
  }) : server;
  const redirect = http.createServer((req, res) => {
    const host = (req.headers.host ?? `localhost:${config.port}`).replace(/[^\w.:\-\[\]]/g, '');
    res.writeHead(308, { location: `https://${host}${req.url ?? '/'}` }).end();
  });
  front.listen(config.port, () => console.log(`[playhall] listening on ${config.tls ? 'https' : 'http'}://:${config.port}${config.tls ? ' (http:// redirects)' : ''}`));

  const stop = () => {
    console.log('[playhall] shutting down');
    if (front !== server) front.close();
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
