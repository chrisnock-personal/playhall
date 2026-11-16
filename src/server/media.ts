// Voice and video through a self-hosted LiveKit server (Apache-2.0). Each
// Playhall room has two LiveKit rooms, CODE:table and CODE:gallery, matching
// the two chats. Playhall decides who may listen and talk (Room.mediaRights)
// and signs short-lived LiveKit tokens; LiveKit carries the audio and video.
// Its signalling (/rtc) is proxied through Playhall's own port, so one HTTPS
// certificate covers both; media itself flows on LiveKit's own UDP/TCP ports.

import net from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { Channel } from '../shared/protocol';

export interface MediaConfig {
  /** Where Playhall reaches LiveKit's signalling, e.g. http://livekit:7880. */
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function mediaConfigFromEnv(): MediaConfig | null {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = process.env;
  if (!url || !apiKey || !apiSecret) return null;
  if (apiSecret.length < 32) throw new Error('LIVEKIT_API_SECRET must be at least 32 random characters');
  return { url: url.replace(/\/$/, ''), apiKey, apiSecret };
}

export const mediaRoomName = (code: string, channel: Channel) => `${code}:${channel}`;

/** A LiveKit token for one person in one channel of one room. */
export async function mediaToken(cfg: MediaConfig, p: {
  code: string; channel: Channel; userId: string; name: string; listen: boolean; talk: boolean;
}): Promise<string> {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity: p.userId, name: p.name, ttl: '10m' });
  at.addGrant({
    room: mediaRoomName(p.code, p.channel), roomJoin: true,
    canSubscribe: p.listen, canPublish: p.talk, canPublishData: false, canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}

/** Pass a WebSocket upgrade on /rtc straight through to LiveKit. */
export function proxyUpgrade(cfg: MediaConfig, req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const target = new URL(cfg.url);
  const upstream = net.connect(Number(target.port || 80), target.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i];
      if (/^host$/i.test(k)) continue;
      lines.push(`${k}: ${req.rawHeaders[i + 1]}`);
    }
    lines.push(`Host: ${target.host}`);
    upstream.write(lines.join('\r\n') + '\r\n\r\n');
    if (head.length) upstream.write(head);
    upstream.pipe(socket).pipe(upstream);
  });
  const close = () => { upstream.destroy(); socket.destroy(); };
  upstream.on('error', close);
  socket.on('error', close);
}

/** Plain HTTP requests under /rtc (LiveKit's /rtc/validate check). */
export async function proxyHttp(cfg: MediaConfig, url: string): Promise<{ status: number; body: string; type: string }> {
  const r = await fetch(cfg.url + url, { signal: AbortSignal.timeout(5000) });
  return { status: r.status, body: await r.text(), type: r.headers.get('content-type') ?? 'text/plain' };
}

/** Keeps LiveKit's permissions in step with the room: when the game starts or
 *  ends, or seats or rules change, everyone in the room's voice channels gets
 *  the rights they now have, and anyone who may no longer listen is removed. */
export class MediaSync {
  private client: RoomServiceClient;
  private last = new Map<string, string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(cfg: MediaConfig) {
    this.client = new RoomServiceClient(cfg.url, cfg.apiKey, cfg.apiSecret);
  }

  changed(room: { rec: { code: string; seats: Record<string, unknown>; game: { status: string }; settings: unknown }; mediaRights(userId: string): ReturnType<RightsFn> }): void {
    const code = room.rec.code;
    const sig = JSON.stringify([room.rec.game.status, room.rec.seats, room.rec.settings]);
    if (this.last.get(code) === sig) return;
    this.last.set(code, sig);
    clearTimeout(this.timers.get(code));
    this.timers.set(code, setTimeout(() => { this.timers.delete(code); void this.apply(code, room); }, 300));
  }

  private async apply(code: string, room: { mediaRights(userId: string): ReturnType<RightsFn> }): Promise<void> {
    for (const channel of ['table', 'gallery'] as Channel[]) {
      const name = mediaRoomName(code, channel);
      let people;
      try { people = await this.client.listParticipants(name); } catch { continue; } // nobody in that channel
      for (const p of people) {
        const r = room.mediaRights(p.identity)?.[channel];
        try {
          if (!r?.listen) await this.client.removeParticipant(name, p.identity);
          else await this.client.updateParticipant(name, p.identity, { permission: { canSubscribe: true, canPublish: r.talk, canPublishData: false } });
        } catch (err) { console.error(`[media] couldn’t update ${p.identity} in ${name}:`, (err as Error).message); }
      }
    }
  }
}
type RightsFn = (userId: string) => Record<Channel, { listen: boolean; talk: boolean }> | null;
