// Voice and video through a self-hosted LiveKit server (Apache-2.0). Each
// Playhall room has two LiveKit rooms, CODE:table and CODE:gallery, matching
// the two chats; a game with teams can also give each side a private,
// audio-only room, named for the game so sides can't reuse the last one.
// Playhall decides who may listen and talk (Room.voiceRight) and signs
// short-lived LiveKit tokens; LiveKit carries the audio and video. Its
// signalling (/rtc) is proxied through Playhall's own port, so one HTTPS
// certificate covers both; media itself flows on LiveKit's own UDP/TCP ports.

import net from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { isTeamVoiceChannel } from '../shared/protocol';
import type { MediaRight, VoiceChannel } from '../shared/protocol';

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

/** Side channels are per game: `generation` keeps the next side out of the
 *  last game's room, even with a token issued before that game started. */
export const mediaRoomName = (code: string, channel: VoiceChannel, generation?: string | null) =>
  generation && isTeamVoiceChannel(channel) ? `${code}:${channel}:${generation}` : `${code}:${channel}`;

/** What someone may send: the microphone when they may talk, the camera
 *  only when they may also show video. LiveKit treats an empty source list as
 *  "anything", so talking always names its sources. */
export function publishSources(r: Pick<MediaRight, 'talk' | 'video'>): TrackSource[] {
  if (!r.talk) return [];
  return r.video ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [TrackSource.MICROPHONE];
}

/** The LiveKit permission for a set of rights (in the token and live updates). */
export function mediaPermission(r: MediaRight) {
  return { canSubscribe: r.listen, canPublish: r.talk, canPublishSources: publishSources(r), canPublishData: false };
}

/** The table camera (a device filming the board in a camera table room):
 *  it sends its camera to the table and nothing else. It can't hear or see
 *  anyone, talk, or send data. */
export function cameraPermission() {
  return { canSubscribe: false, canPublish: true, canPublishSources: [TrackSource.CAMERA], canPublishData: false };
}

/** LiveKit identities of table cameras start with this; people's are user ids (UUIDs). */
export const CAMERA_PREFIX = 'camera:';

/** A LiveKit token for a room's table camera device, in the table channel. */
export async function cameraToken(cfg: MediaConfig, p: { code: string; cameraId: string }): Promise<string> {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity: CAMERA_PREFIX + p.cameraId, name: 'Table camera', ttl: '10m' });
  at.addGrant({ room: mediaRoomName(p.code, 'table'), roomJoin: true, ...cameraPermission(), canUpdateOwnMetadata: false });
  return at.toJwt();
}

/** A LiveKit token for one person in one channel of one game. */
export async function mediaToken(cfg: MediaConfig, p: {
  code: string; channel: VoiceChannel; userId: string; name: string; generation?: string | null;
} & MediaRight): Promise<string> {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity: p.userId, name: p.name, ttl: '10m' });
  at.addGrant({ room: mediaRoomName(p.code, p.channel, p.generation), roomJoin: true, ...mediaPermission(p), canUpdateOwnMetadata: false });
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
 *  the rights they now have (a camera no longer allowed is stopped by LiveKit),
 *  and anyone who may no longer listen is removed. A new game gets new side
 *  rooms, so the old ones are closed and old tokens can't bring anyone back. */
export class MediaSync {
  private client: RoomServiceClient;
  private last = new Map<string, string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, string | null>();
  private teamChannels = new Map<string, Set<`team-${number}`>>();

  constructor(cfg: MediaConfig) {
    this.client = new RoomServiceClient(cfg.url, cfg.apiKey, cfg.apiSecret);
  }

  changed(room: SyncedRoom): void {
    const code = room.rec.code;
    const sig = JSON.stringify([
      room.rec.game.status, room.rec.seats, room.rec.settings, room.rec.tableCamera?.id ?? null, room.voiceGeneration(),
    ]);
    if (this.last.get(code) === sig) return;
    this.last.set(code, sig);
    clearTimeout(this.timers.get(code));
    this.timers.set(code, setTimeout(() => { this.timers.delete(code); void this.apply(code, room); }, 300));
  }

  private async apply(code: string, room: SyncedRoom): Promise<void> {
    const generation = room.voiceGeneration();
    const previous = this.generations.get(code);
    const known = this.teamChannels.get(code) ?? new Set<`team-${number}`>();
    if (previous && previous !== generation) {
      for (const channel of known) {
        const oldName = mediaRoomName(code, channel, previous);
        await this.client.deleteRoom(oldName).catch((err) => console.error(`[media] couldn’t close ${oldName}:`, (err as Error).message));
      }
    }
    this.generations.set(code, generation);
    const channels: VoiceChannel[] = ['table', 'gallery', ...known, ...room.teamVoiceChannels()];
    for (const channel of new Set(channels)) {
      if (isTeamVoiceChannel(channel)) known.add(channel);
      const name = mediaRoomName(code, channel, isTeamVoiceChannel(channel) ? generation : undefined);
      let people;
      try { people = await this.client.listParticipants(name); } catch { continue; } // nobody in that channel
      for (const p of people) {
        // A table camera stays only while it's the room's current one.
        if (p.identity.startsWith(CAMERA_PREFIX)) {
          if (channel !== 'table' || !room.isTableCamera(p.identity.slice(CAMERA_PREFIX.length))) {
            await this.client.removeParticipant(name, p.identity).catch((err) => console.error(`[media] couldn’t remove ${p.identity} from ${name}:`, (err as Error).message));
          }
          continue;
        }
        const r = room.voiceRight(p.identity, channel);
        try {
          if (!r?.listen) await this.client.removeParticipant(name, p.identity);
          else await this.client.updateParticipant(name, p.identity, { permission: mediaPermission(r) });
        } catch (err) { console.error(`[media] couldn’t update ${p.identity} in ${name}:`, (err as Error).message); }
      }
    }
    this.teamChannels.set(code, known);
  }
}
interface SyncedRoom {
  rec: { code: string; seats: Record<string, unknown>; game: { status: string }; settings: unknown; tableCamera?: { id: string } | null };
  voiceGeneration(): string | null;
  teamVoiceChannels(): `team-${number}`[];
  voiceRight(userId: string, channel: VoiceChannel): MediaRight | null;
  isTableCamera(id: string): boolean;
}
