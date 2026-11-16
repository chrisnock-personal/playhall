// Transcripts: what people say in voice, written into the room's chat as
// *said* lines. The speaker's own browser cuts their speech into short
// utterances (only while their mic is live and the room has transcripts on),
// and posts each one here as a 16 kHz mono WAV. Playhall checks they may talk
// in that channel, forwards the audio to the shared Whisper server
// (WHISPER_URL, whisper.cpp's /inference) and posts the text. The audio is
// never written anywhere: it lives in memory for the one request and is
// dropped; only the text line is kept, like any chat line.

import { getPlatformSettings } from './platform';
import type { Request, Response } from 'express';
import type { Channel } from '../shared/protocol';
import type { Room } from './rooms/room';
import { RoomError } from './rooms/room';

/** The Whisper server's base URL, or null when there is none. */
export function whisperUrl(): string | null {
  const u = (process.env.WHISPER_URL ?? '').trim();
  return u ? u.replace(/\/$/, '') : null;
}

/** May rooms on this server use transcripts at all? */
export function transcriptsAllowed(): boolean {
  if ((process.env.TRANSCRIPTS ?? '').trim().toLowerCase() === 'off' || !whisperUrl()) return false;
  // The platform admin can switch them off for everyone (#20).
  return getPlatformSettings().transcriptsAllowed;
}

export const SAMPLE_RATE = 16_000;
/** Longest utterance the browser sends (it cuts at 15 s), with some slack. */
export const MAX_SECONDS = 16;
export const MIN_SECONDS = 0.25;
export const MAX_WAV_BYTES = 44 + MAX_SECONDS * SAMPLE_RATE * 2;

/** Is this a 16 kHz, mono, 16-bit PCM WAV of a sensible length? */
export function checkWav(buf: Buffer): { seconds: number } | { error: string } {
  if (!Buffer.isBuffer(buf) || buf.length < 44) return { error: 'Not a WAV file' };
  if (buf.length > MAX_WAV_BYTES) return { error: 'Too long: send at most 15 seconds at a time' };
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return { error: 'Not a WAV file' };
  // Walk the chunks for fmt and data (browsers write them in order, but be kind).
  let off = 12, fmt: { format: number; channels: number; rate: number; bits: number } | null = null, dataBytes = -1;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ' && off + 24 <= buf.length) {
      fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    } else if (id === 'data') {
      dataBytes = Math.min(size, buf.length - off - 8);
      break;
    }
    off += 8 + size + (size & 1);
  }
  if (!fmt || dataBytes < 0) return { error: 'Not a WAV file' };
  if (fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== SAMPLE_RATE || fmt.bits !== 16) return { error: 'Send 16 kHz mono 16-bit PCM' };
  const seconds = dataBytes / (SAMPLE_RATE * 2);
  if (seconds < MIN_SECONDS) return { error: 'Too short' };
  return { seconds };
}

const NOISE = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+/g;

/** Whisper's text, tidied; null when it heard nothing worth a chat line
 *  ("[BLANK_AUDIO]", "(music)", "*laughs*", bare punctuation). */
export function cleanTranscript(text: unknown, max = 1000): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return null;
  return t.slice(0, max);
}

/** Send one WAV to whisper.cpp's server and return the raw text. */
export async function whisperTranscribe(url: string, wav: Buffer, timeoutMs = 20_000): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'said.wav');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const r = await fetch(`${url}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`Whisper answered ${r.status}`);
  const data = await r.json() as { text?: unknown };
  return typeof data.text === 'string' ? data.text : '';
}

/** Per person: a few utterances a minute and at most two waiting on Whisper. */
export class SaidLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  private busy = new Map<string, number>();
  constructor(private perMinute = 40, private inFlight = 2, private now: () => number = Date.now) {}

  /** A release function, or null when this person is over their limit. */
  take(userId: string): (() => void) | null {
    const now = this.now();
    let h = this.hits.get(userId);
    if (!h || h.reset < now) { h = { n: 0, reset: now + 60_000 }; this.hits.set(userId, h); }
    if (h.n >= this.perMinute || (this.busy.get(userId) ?? 0) >= this.inFlight) return null;
    h.n++;
    this.busy.set(userId, (this.busy.get(userId) ?? 0) + 1);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const b = (this.busy.get(userId) ?? 1) - 1;
      if (b > 0) this.busy.set(userId, b); else this.busy.delete(userId);
    };
  }
}

type SaidRoom = Pick<Room, 'saidRefusal' | 'said'>;

export interface SaidDeps {
  getRoom(code: string): Promise<SaidRoom | null>;
  allowed(): boolean;
  transcribe(wav: Buffer): Promise<string>;
  limiter: SaidLimiter;
}

export interface SaidResult { status: number; body: { text?: string | null; error?: string } }

/** The route's logic, without Express: who may, the audio, Whisper, the line. */
export async function handleSaid(deps: SaidDeps, p: { code: string; channel: string; userId: string; wav: unknown }): Promise<SaidResult> {
  if (!deps.allowed()) return { status: 503, body: { error: 'Transcripts are switched off on this server' } };
  const channel = p.channel as Channel;
  if (channel !== 'table' && channel !== 'gallery') return { status: 404, body: { error: 'No such channel' } };
  const room = await deps.getRoom(p.code);
  if (!room) return { status: 404, body: { error: 'No such room' } };
  const why = room.saidRefusal(p.userId, channel);
  if (why) return { status: 403, body: { error: why } };
  if (!Buffer.isBuffer(p.wav)) return { status: 415, body: { error: 'Send the audio as audio/wav' } };
  const wav = checkWav(p.wav);
  if ('error' in wav) return { status: 400, body: { error: wav.error } };
  const release = deps.limiter.take(p.userId);
  if (!release) return { status: 429, body: { error: 'Too much at once: slow down a little' } };
  let raw: string;
  try {
    raw = await deps.transcribe(p.wav);
  } catch (err) {
    console.error('[transcripts] whisper failed:', (err as Error).message);
    return { status: 502, body: { error: 'The speech-to-text server isn’t answering' } };
  } finally {
    release();
  }
  const text = cleanTranscript(raw);
  if (!text) return { status: 200, body: { text: null } };
  try {
    // Checked again: the game may have started (or the rule changed) meanwhile.
    room.said(p.userId, channel, text);
  } catch (err) {
    if (err instanceof RoomError) return { status: 403, body: { error: err.message } };
    throw err;
  }
  return { status: 201, body: { text } };
}

/** POST /api/rooms/:code/said/:channel with an audio/wav body. */
export function saidHandler(deps: SaidDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const r = await handleSaid(deps, { code: String(req.params.code), channel: String(req.params.channel), userId: req.user!.id, wav: req.body });
    res.status(r.status).json(r.body);
  };
}
