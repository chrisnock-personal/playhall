import type { SessionUser } from '../shared/protocol';

const KEY = 'playhall.session';

export interface Session {
  token: string;
  user: SessionUser;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the session lasts for this tab only */
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

/** The pass that opens a private room, kept per room on this device. */
export function readRoomPass(code: string): string | null {
  try { return localStorage.getItem(`playhall.pass.${code}`); } catch { return null; }
}

export function saveRoomPass(code: string, pass: string): void {
  try { localStorage.setItem(`playhall.pass.${code}`, pass); } catch { /* this tab only */ }
}

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`playhall.${key}`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown): void {
  try { localStorage.setItem(`playhall.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
}
