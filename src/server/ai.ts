// AI players (#32): ask the model server the platform admin set up (Ollama's
// chat API) for one decision. Only ever the server the admin named; nothing
// goes anywhere else. Any failure (off, unreachable, too slow, not JSON) is
// null, and the room's rule bot plays the move instead.

import { getPlatformSettings } from './platform';

/** AI players are switched on and have a server to ask. */
export function aiAvailable(): boolean {
  const a = getPlatformSettings().aiPlayers;
  return a.enabled && !!a.url;
}

export async function askModel(system: string, user: string): Promise<string | null> {
  const a = getPlatformSettings().aiPlayers;
  if (!a.enabled || !a.url) return null;
  try {
    const res = await fetch(`${a.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(a.seconds * 1000),
      body: JSON.stringify({
        model: a.model, stream: false, format: 'json', keep_alive: '10m',
        options: { temperature: 0.7, num_ctx: 8192 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) { console.warn(`AI players: the model server answered ${res.status}`); return null; }
    const body = await res.json() as { message?: { content?: string } };
    return body.message?.content ?? null;
  } catch (err) {
    console.warn(`AI players: no answer from the model server (${(err as Error).name === 'TimeoutError' ? 'too slow' : (err as Error).message})`);
    return null;
  }
}

/** For the admin page: can the server be reached, and does it have the model? */
export async function checkModelServer(): Promise<{ ok: boolean; message: string }> {
  const a = getPlatformSettings().aiPlayers;
  if (!a.url) return { ok: false, message: 'Give the model server’s address first.' };
  try {
    const res = await fetch(`${a.url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, message: `The server answered ${res.status}.` };
    const { models } = await res.json() as { models?: { name: string }[] };
    const names = (models ?? []).map((m) => m.name);
    return names.includes(a.model)
      ? { ok: true, message: `Reached it; ${a.model} is there.` }
      : { ok: false, message: `Reached it, but it has no ${a.model}. It has: ${names.join(', ') || 'no models'}.` };
  } catch (err) {
    return { ok: false, message: `Couldn’t reach it: ${(err as Error).message}.` };
  }
}
