// HTTPS. Browsers only allow microphones and cameras over HTTPS, so Playhall
// serves it by default with a self-signed certificate made on first start and
// kept in TLS_DIR (a volume in the container), so redeploys don't change it
// and people accept it once per device. An admin can swap in a real one
// (server + intermediates as one PEM, and its key): replaceCert() checks the
// pair and swaps it in live, with no restart and no dropped connections.
// Until the admin page exists (#20), put the files in TLS_DIR and send the
// process SIGHUP. Pure JavaScript (no openssl command), so it works the same
// on Windows, macOS and Linux.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type https from 'node:https';
import { generate } from 'selfsigned';

export interface CertInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint256: string;
  selfSigned: boolean;
  expired: boolean;
}

export const certFiles = (dir: string) => ({ cert: path.join(dir, 'server.crt'), key: path.join(dir, 'server.key') });

export function describeCert(pem: string): CertInfo {
  const x = new crypto.X509Certificate(pem);
  return {
    subject: x.subject, issuer: x.issuer, validFrom: x.validFrom, validTo: x.validTo, fingerprint256: x.fingerprint256,
    selfSigned: x.subject === x.issuer, expired: new Date(x.validTo) < new Date(),
  };
}

/** Is this a usable pair? Returns a reason in plain words when it isn't. */
export function checkPair(certPem: string, keyPem: string): string | null {
  let x: crypto.X509Certificate;
  try { x = new crypto.X509Certificate(certPem); } catch { return 'The certificate isn’t a PEM certificate'; }
  let key: crypto.KeyObject;
  try { key = crypto.createPrivateKey(keyPem); } catch { return 'The private key isn’t a PEM private key'; }
  if (!crypto.createPublicKey(key).equals(x.publicKey)) return 'The certificate and the private key don’t match';
  if (new Date(x.validTo) < new Date()) return `The certificate expired on ${x.validTo}`;
  return null;
}

/** The names a self-signed certificate covers: localhost, this machine's
 *  name and addresses, and anything in TLS_HOSTS (comma-separated). */
function altNames(extra: string[]) {
  const ips = new Set(['127.0.0.1', '::1']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) if (!a.internal) ips.add(a.address);
  const dns = new Set(['localhost', os.hostname()]);
  for (const h of extra) (/^[\d.]+$|:/.test(h) ? ips : dns).add(h);
  return [...[...dns].map((value) => ({ type: 2 as const, value })), ...[...ips].map((ip) => ({ type: 7 as const, ip }))];
}

/** The certificate and key to serve: the ones in `dir`, or a new self-signed pair. */
export async function ensureCert(dir: string, hosts: string[]): Promise<{ cert: string; key: string; generated: boolean }> {
  const f = certFiles(dir);
  if (fs.existsSync(f.cert) && fs.existsSync(f.key)) return { cert: fs.readFileSync(f.cert, 'utf8'), key: fs.readFileSync(f.key, 'utf8'), generated: false };
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const pems = await generate([{ name: 'commonName', value: 'playhall' }], {
    keySize: 2048, algorithm: 'sha256', notBeforeDate: now, notAfterDate: new Date(now.getTime() + 3650 * 86_400_000),
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: altNames(hosts) },
    ],
  });
  fs.writeFileSync(f.key, pems.private, { mode: 0o600 });
  fs.writeFileSync(f.cert, pems.cert, { mode: 0o644 });
  return { cert: pems.cert, key: pems.private, generated: true };
}

/** Check a new pair, then serve it from now on (and keep it in `dir`). */
export function replaceCert(server: https.Server, dir: string, certPem: string, keyPem: string): CertInfo {
  const problem = checkPair(certPem, keyPem);
  if (problem) throw new Error(problem);
  server.setSecureContext({ cert: certPem, key: keyPem });
  const f = certFiles(dir);
  fs.writeFileSync(f.cert, certPem, { mode: 0o644 });
  fs.writeFileSync(f.key, keyPem, { mode: 0o600 });
  return describeCert(certPem);
}
