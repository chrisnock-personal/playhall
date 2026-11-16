import path from 'node:path';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set`);
  return v;
}

export interface Config {
  port: number;
  /** Serve HTTPS (the default; TLS=off for plain HTTP behind your own proxy or in development). */
  tls: boolean;
  tlsDir: string;
  /** Extra names and addresses for the self-signed certificate. */
  tlsHosts: string[];
  databaseUrl: string;
  jwtSecret: string;
  allowSignup: boolean;
  staticDir: string;
  migrationsDir: string;
}

export function loadConfig(): Config {
  const jwtSecret = required('JWT_SECRET');
  // Fail closed: a short or example secret would let anyone mint sessions.
  if (jwtSecret.length < 32 || /change.?me/i.test(jwtSecret)) {
    throw new Error('JWT_SECRET must be at least 32 random characters (openssl rand -hex 32)');
  }
  return {
    port: Number(process.env.PORT ?? 8450),
    tls: (process.env.TLS ?? 'on') !== 'off',
    tlsDir: path.resolve(process.env.TLS_DIR ?? 'certs'),
    tlsHosts: (process.env.TLS_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean),
    databaseUrl: required('DATABASE_URL'),
    jwtSecret,
    allowSignup: (process.env.ALLOW_SIGNUP ?? 'true') !== 'false',
    staticDir: path.resolve(process.env.STATIC_DIR ?? 'dist/client'),
    migrationsDir: path.resolve(process.env.MIGRATIONS_DIR ?? 'migrations'),
  };
}
