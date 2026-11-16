// Table sounds (#29), made on the spot with the Web Audio API: no audio
// files, so nothing to download and no licences to track. Every sound is a
// short recipe of tones and filtered noise.
//
// Browsers only let a page make sound after the person has clicked or typed
// on it, so nothing is created until then: armSound() waits for the first
// gesture, and play() is silent before it. Kept quiet on purpose (under
// voice chat), and quieter still while someone is talking (setDuck).
//
// The person's choices (mute, volume, sounds while watching) are kept per
// browser in localStorage.

import type { Sound } from './cues';

export interface SoundPrefs {
  /** All table sounds off. */
  muted: boolean;
  /** 0-1. */
  volume: number;
  /** Also play them while watching (off by default). */
  watching: boolean;
}

export const DEFAULT_PREFS: SoundPrefs = { muted: false, volume: 0.6, watching: false };
const KEY = 'playhall.sound';

/** Prefs from whatever was stored, with anything odd replaced by the default. */
export function parsePrefs(raw: string | null): SoundPrefs {
  let v: Partial<SoundPrefs> = {};
  try { v = raw ? JSON.parse(raw) ?? {} : {}; } catch { v = {}; }
  const volume = typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : DEFAULT_PREFS.volume;
  return {
    muted: typeof v.muted === 'boolean' ? v.muted : DEFAULT_PREFS.muted,
    volume,
    watching: typeof v.watching === 'boolean' ? v.watching : DEFAULT_PREFS.watching,
  };
}

let prefs: SoundPrefs | null = null;
const listeners = new Set<() => void>();

export function getPrefs(): SoundPrefs {
  if (!prefs) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    prefs = parsePrefs(raw);
  }
  return prefs;
}

export function setPrefs(change: Partial<SoundPrefs>) {
  prefs = { ...getPrefs(), ...change };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked: kept for this visit */ }
  applyGain();
  for (const l of listeners) l();
}

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---- the audio graph ----

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let duck = 1;
let armed = false;

/** Loudest a sound gets at full volume: well under a voice. */
const CEILING = 0.32;

function applyGain() {
  if (!ctx || !master) return;
  const p = getPrefs();
  const g = p.muted ? 0 : p.volume * p.volume * CEILING * duck;
  master.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
}

function makeContext(): Ctx | null {
  if (ctx) return ctx;
  const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try { ctx = new C(); } catch { return null; }
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.ratio.value = 12;
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  // Fixed noise (not Math.random each time), so a sound is the same for everyone.
  let seed = 7;
  for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  applyGain();
  return ctx;
}

/** Call inside a click or key handler: makes (or wakes) the audio. */
export function unlockSound() {
  const c = makeContext();
  if (!c) return;
  if (c.state !== 'running') void c.resume().catch(() => {});
  // iOS Safari only opens the audio once something has played in a gesture.
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  } catch { /* fine */ }
}

/** Get ready to play once the person first clicks, taps or types. */
export function armSound() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  // Kept listening (it's cheap): a browser may suspend the audio again later.
  const go = () => { if (ctx?.state !== 'running') unlockSound(); };
  for (const e of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend']) window.addEventListener(e, go, { capture: true, passive: true });
}

/** Whether the audio is open (the person has interacted and the browser allowed it). */
export const soundReady = () => ctx?.state === 'running';

/** Quieter while voice chat is on (0.6) and more so while someone talks (0.35). */
export function setDuck(level: number) {
  duck = Math.min(1, Math.max(0, level));
  applyGain();
}

/** Play a sound `delay` ms from now. Silent until the person has interacted
 *  with the page, while muted, or if the browser has no Web Audio. */
export function play(sound: Sound, delay = 0) {
  if (!ctx || !master || !noiseBuf) return;
  const p = getPrefs();
  if (p.muted || p.volume <= 0) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  if (ctx.state === 'closed') return;
  const t = ctx.currentTime + 0.01 + Math.max(0, delay) / 1000;
  try { RECIPES[sound]?.(t); } catch { /* never let a sound break the table */ }
}

// ---- building blocks ----

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** A tone: `freq` sliding to `to`, shaped by a quick attack and a decay. */
function tone(t: number, freq: number, { to, type = 'sine', gain = 0.5, attack = 0.005, decay = 0.15 }: {
  to?: number; type?: OscillatorType; gain?: number; attack?: number; decay?: number;
} = {}) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  env(g, t, gain, attack, decay);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** A burst of filtered noise: clicks, swishes, bangs and splashes. */
function noise(t: number, { filter = 'bandpass', freq = 2000, to, q = 1, gain = 0.5, attack = 0.002, decay = 0.08, offset = 0 }: {
  filter?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; attack?: number; decay?: number; offset?: number;
} = {}) {
  const c = ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  f.Q.value = q;
  env(g, t, gain, attack, decay);
  src.connect(f).connect(g).connect(master!);
  src.start(t, offset % 0.9);
  src.stop(t + attack + decay + 0.05);
}

const click = (t: number, freq = 3000, gain = 0.4, decay = 0.03) => noise(t, { filter: 'bandpass', freq, q: 2, gain, decay });
const knock = (t: number, freq = 180, gain = 0.6) => { tone(t, freq, { to: freq * 0.7, type: 'triangle', gain, decay: 0.09 }); click(t, 1800, gain * 0.5, 0.02); };
const clink = (t: number, freq = 3100, gain = 0.25) => { tone(t, freq, { gain, decay: 0.07 }); tone(t, freq * 1.47, { gain: gain * 0.5, decay: 0.05 }); };
const note = (t: number, freq: number, gain = 0.3, decay = 0.35) => { tone(t, freq, { type: 'triangle', gain, attack: 0.01, decay }); tone(t, freq * 2, { gain: gain * 0.15, attack: 0.01, decay: decay * 0.6 }); };

// Each recipe is short (well under a second) and deterministic.
const RECIPES: Record<Sound, (t: number) => void> = {
  dice: (t) => {
    // Rattling across the table: a few knocks, closer together and softer.
    [0, 0.07, 0.13, 0.2, 0.25, 0.3].forEach((d, i) => {
      knock(t + d, 520 + ((i * 137) % 260), 0.42 - i * 0.05);
      click(t + d, 3500 + ((i * 523) % 1500), 0.3 - i * 0.03);
    });
  },
  shuffle: (t) => {
    // A riffle: many tiny card ticks rising and falling, then the cards squared up.
    for (let i = 0; i < 16; i++) {
      const loud = Math.sin((i / 15) * Math.PI) * 0.22 + 0.06;
      noise(t + i * 0.019, { filter: 'highpass', freq: 3500, gain: loud, decay: 0.018, offset: i * 0.05 });
    }
    noise(t + 0.33, { filter: 'lowpass', freq: 900, gain: 0.35, decay: 0.06 });
  },
  card: (t) => {
    noise(t, { filter: 'bandpass', freq: 1800, to: 4800, q: 0.8, gain: 0.3, attack: 0.01, decay: 0.07 });
    click(t + 0.075, 2500, 0.25);
  },
  draw: (t) => noise(t, { filter: 'bandpass', freq: 3200, to: 1400, q: 0.9, gain: 0.28, attack: 0.02, decay: 0.12 }),
  flip: (t) => { noise(t, { filter: 'highpass', freq: 2500, gain: 0.25, decay: 0.03 }); click(t + 0.04, 2200, 0.35, 0.025); },
  chip: (t) => { clink(t, 3100); clink(t + 0.045, 2700, 0.18); },
  chips: (t) => { [0, 0.04, 0.09, 0.12, 0.17].forEach((d, i) => clink(t + d, 2600 + ((i * 311) % 900), 0.2 - i * 0.02)); },
  move: (t) => knock(t, 210, 0.5),
  capture: (t) => { knock(t, 240, 0.5); knock(t + 0.06, 150, 0.6); },
  drop: (t) => { knock(t, 330, 0.55); knock(t + 0.07, 300, 0.2); },
  place: (t) => { tone(t, 1150, { type: 'triangle', gain: 0.3, decay: 0.04 }); click(t, 2800, 0.25, 0.02); },
  climb: (t) => { [523, 659, 784, 1047].forEach((f, i) => note(t + i * 0.06, f, 0.22, 0.14)); },
  slide: (t) => { tone(t, 950, { to: 220, type: 'sine', gain: 0.25, attack: 0.02, decay: 0.38 }); tone(t, 1900, { to: 440, gain: 0.05, attack: 0.02, decay: 0.3 }); },
  launch: (t) => {
    noise(t, { filter: 'bandpass', freq: 400, to: 2600, q: 1.5, gain: 0.35, attack: 0.15, decay: 0.16 });
    tone(t, 90, { to: 60, type: 'sawtooth', gain: 0.08, attack: 0.02, decay: 0.25 });
  },
  hit: (t) => {
    noise(t, { filter: 'lowpass', freq: 2500, to: 180, gain: 0.8, decay: 0.38 });
    tone(t, 110, { to: 38, gain: 0.7, decay: 0.3 });
  },
  sink: (t) => {
    noise(t, { filter: 'lowpass', freq: 3000, to: 120, gain: 0.9, decay: 0.55 });
    tone(t, 95, { to: 30, gain: 0.85, decay: 0.55 });
    noise(t + 0.16, { filter: 'lowpass', freq: 1400, to: 100, gain: 0.55, decay: 0.5, offset: 0.3 });
    tone(t + 0.16, 70, { to: 28, gain: 0.5, decay: 0.45 });
  },
  splash: (t) => {
    noise(t, { filter: 'bandpass', freq: 1300, to: 600, q: 0.7, gain: 0.55, attack: 0.008, decay: 0.3 });
    noise(t + 0.03, { filter: 'highpass', freq: 4000, gain: 0.2, decay: 0.2, offset: 0.4 });
    [0.12, 0.17, 0.23].forEach((d, i) => tone(t + d, 600 + i * 180, { to: 1100 + i * 200, gain: 0.07, decay: 0.05 }));
  },
  turn: (t) => { note(t, 659, 0.22, 0.3); note(t + 0.12, 880, 0.22, 0.45); },
  warn: (t) => { note(t, 880, 0.2, 0.15); note(t + 0.18, 880, 0.2, 0.2); },
  tick: (t) => click(t, 1600, 0.3, 0.025),
  win: (t) => {
    [523, 659, 784, 1047].forEach((f, i) => note(t + i * 0.09, f, 0.24, 0.3));
    [523, 659, 784].forEach((f) => note(t + 0.4, f, 0.14, 0.7));
  },
  end: (t) => { note(t, 587, 0.18, 0.3); note(t + 0.16, 440, 0.18, 0.55); },
};
