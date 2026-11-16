import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { MediaSync, mediaConfigFromEnv } from './media';
import { certFiles, describeCert, ensureCert, replaceCert } from './tls';
import { loadConfig } from './config';
import { createPool, migrate } from './db';
import { Auth } from './auth';
import { RoomManager } from './rooms/manager';
import { RoomSockets } from './ws';
import { createApp } from './http';
import { loadPlatformSettings } from './platform';
import type { AdminTls } from './admin';

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

  await loadPlatformSettings(db, { signupsAllowed: config.allowSignup });
  const auth = new Auth(db, config.jwtSecret, config.adminUsernames);
  await auth.loadAdmins();
  if (await auth.ensureDefaultAdmin()) {
    console.log('[playhall] made the default admin account: username admin, password ' + (process.env.ADMIN_PASSWORD ? 'from ADMIN_PASSWORD' : 'admin') + '. It must choose a new password at its first sign-in.');
  }
  if (!config.adminUsernames.length && auth.adminCount === 0) console.log('[playhall] no admins yet: set ADMIN_USERNAMES to an account\'s username to open the platform settings page');
  // The sockets need the manager and the manager reports changes to the
  // sockets, so one is handed to the other through a getter.
  let rooms!: RoomManager;
  const media = mediaConfigFromEnv();
  console.log(`[playhall] voice and video: ${media ? `LiveKit at ${media.url}` : 'off (LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET not set)'}`);
  const sockets = new RoomSockets(auth, () => rooms, media);
  const mediaSync = media ? new MediaSync(media) : null;
  rooms = new RoomManager(db, (room) => { sockets.changed(room); mediaSync?.changed(room); }, (room, userId, reason) => sockets.kick(room, userId, reason));

  // The admin page shows and replaces the certificate; the HTTPS server is
  // made after the app, so it's reached through these.
  let secure: https.Server | null = null;
  let servedCert: string | null = null;
  const tls: AdminTls | null = config.tls ? {
    current: () => (servedCert ? describeCert(servedCert) : null),
    replace: (cert, key) => {
      if (!secure) throw new Error('The HTTPS server isn’t running yet');
      const info = replaceCert(secure, config.tlsDir, cert, key);
      servedCert = cert;
      console.log(`[playhall] certificate replaced from the admin page: ${info.subject.replace(/\n/g, ', ')}, until ${info.validTo}`);
      return info;
    },
  } : null;
  const app = createApp({ auth, rooms, sockets, db, staticDir: config.staticDir, media, tls });
  let server: http.Server;
  if (config.tls) {
    const pair = await ensureCert(config.tlsDir, config.tlsHosts);
    servedCert = pair.cert;
    const info = describeCert(pair.cert);
    console.log(`[playhall] ${pair.generated ? 'made a self-signed certificate' : 'certificate'}: ${info.subject.replace(/\n/g, ', ')}, ${info.selfSigned ? 'self-signed' : `issued by ${info.issuer.replace(/\n/g, ', ')}`}, until ${info.validTo}, SHA-256 ${info.fingerprint256}`);
    if (info.expired) console.warn('[playhall] the certificate has EXPIRED: browsers will refuse it');
    const httpsServer = https.createServer({ cert: pair.cert, key: pair.key }, app);
    secure = httpsServer;
    // SIGHUP: reload the certificate files in TLS_DIR (e.g. after copying in a real one).
    process.on('SIGHUP', () => {
      try {
        const f = certFiles(config.tlsDir);
        const pem = fs.readFileSync(f.cert, 'utf8');
        const next = replaceCert(httpsServer, config.tlsDir, pem, fs.readFileSync(f.key, 'utf8'));
        servedCert = pem;
        console.log(`[playhall] certificate reloaded: ${next.subject.replace(/\n/g, ', ')}, until ${next.validTo}`);
      } catch (err) { console.error(`[playhall] certificate NOT reloaded, still serving the old one: ${(err as Error).message}`); }
    });
    server = httpsServer;
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
    // Save running games first, so their clocks resume from now on restart.
    rooms.flush().catch(() => {}).finally(() => server.close(() => db.end().then(() => process.exit(0))));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error('[playhall] failed to start:', err.message ?? err);
  process.exit(1);
});
