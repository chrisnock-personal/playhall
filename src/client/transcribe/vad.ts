// A simple energy-based voice activity detector that cuts a stream of 16 kHz
// mono samples into utterances: speech starts when a few frames in a row are
// clearly louder than the background, and ends after a pause (700 ms) or at
// the longest length (15 s). Pure, so it can be tested without a browser.

export interface VadOptions {
  rate: number;
  /** Frame length for the energy measure. */
  frameMs: number;
  /** Loud frames in a row needed to start an utterance. */
  startMs: number;
  /** Quiet this long ends an utterance. */
  endSilenceMs: number;
  /** Longest utterance; longer speech is cut and goes on in the next one. */
  maxMs: number;
  /** Audio kept from just before speech starts (the first consonant). */
  preRollMs: number;
  /** Quiet kept at the end of an utterance. */
  tailMs: number;
  /** Utterances with less speech than this are dropped (a cough, a click). */
  minSpeechMs: number;
  /** Never treat anything quieter than this RMS as speech (about -50 dBFS). */
  minRms: number;
  /** Speech must be this many times the background level. */
  ratio: number;
}

export const VAD_DEFAULTS: VadOptions = {
  rate: 16_000, frameMs: 20, startMs: 60, endSilenceMs: 700, maxMs: 15_000,
  preRollMs: 300, tailMs: 200, minSpeechMs: 250, minRms: 0.003, ratio: 3,
};

export function rms(frame: Float32Array): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  return Math.sqrt(s / Math.max(1, frame.length));
}

export class Utterances {
  readonly o: VadOptions;
  private frameLen: number;
  private pending: Float32Array;
  private filled = 0;
  private preRoll: Float32Array[] = [];  // recent quiet frames
  private loudRun: Float32Array[] = [];  // loud frames waiting to confirm a start
  private current: Float32Array[] | null = null;
  private silentFrames = 0;
  private speechFrames = 0;
  private noise = -1;                    // background RMS estimate

  constructor(opts: Partial<VadOptions> = {}) {
    this.o = { ...VAD_DEFAULTS, ...opts };
    this.frameLen = Math.round(this.o.rate * this.o.frameMs / 1000);
    this.pending = new Float32Array(this.frameLen);
  }

  private frames(ms: number): number { return Math.max(1, Math.round(ms / this.o.frameMs)); }

  /** True while an utterance is under way. */
  get speaking(): boolean { return this.current !== null; }

  /** Feed samples; returns any utterances that finished. */
  push(samples: Float32Array): Float32Array[] {
    const done: Float32Array[] = [];
    let i = 0;
    while (i < samples.length) {
      const n = Math.min(this.frameLen - this.filled, samples.length - i);
      this.pending.set(samples.subarray(i, i + n), this.filled);
      this.filled += n; i += n;
      if (this.filled === this.frameLen) {
        const u = this.frame(this.pending.slice());
        this.filled = 0;
        if (u) done.push(u);
      }
    }
    return done;
  }

  /** End the utterance under way now and return it (if it had enough
   *  speech): for when the mic is muted or push to talk is let go. */
  flush(): Float32Array | null {
    if (this.current && this.filled) this.current.push(this.pending.slice(0, this.filled));
    const u = this.finish();
    this.reset();
    return u;
  }

  /** Forget everything (nothing is sent). The background level is kept. */
  reset(): void {
    this.filled = 0; this.preRoll = []; this.loudRun = []; this.current = null; this.silentFrames = 0; this.speechFrames = 0;
  }

  private threshold(): number {
    return Math.max(this.o.minRms, this.noise < 0 ? 0 : this.noise * this.o.ratio);
  }

  private frame(f: Float32Array): Float32Array | null {
    const level = rms(f);
    const loud = level >= this.threshold();
    if (!this.current) {
      if (loud) {
        this.loudRun.push(f);
        if (this.loudRun.length >= this.frames(this.o.startMs)) {
          this.current = [...this.preRoll, ...this.loudRun];
          this.speechFrames = this.loudRun.length;
          this.silentFrames = 0;
          this.loudRun = []; this.preRoll = [];
        }
        return null;
      }
      // Quiet again: the loud blip wasn't speech.
      for (const x of this.loudRun) this.keepPreRoll(x);
      this.loudRun = [];
      this.keepPreRoll(f);
      this.learnNoise(level);
      return null;
    }
    this.current.push(f);
    if (loud) { this.speechFrames++; this.silentFrames = 0; } else { this.silentFrames++; this.learnNoise(level); }
    if (this.silentFrames >= this.frames(this.o.endSilenceMs) || this.current.length >= this.frames(this.o.maxMs)) return this.finish();
    return null;
  }

  private keepPreRoll(f: Float32Array): void {
    this.preRoll.push(f);
    const max = this.frames(this.o.preRollMs);
    if (this.preRoll.length > max) this.preRoll.splice(0, this.preRoll.length - max);
  }

  private learnNoise(level: number): void {
    // Follows a quieter background quickly and a louder one slowly.
    if (this.noise < 0) this.noise = level;
    else this.noise = level < this.noise ? this.noise * 0.7 + level * 0.3 : this.noise * 0.98 + level * 0.02;
  }

  private finish(): Float32Array | null {
    const parts = this.current, speech = this.speechFrames, silent = this.silentFrames;
    this.current = null; this.silentFrames = 0; this.speechFrames = 0;
    if (!parts || speech < this.frames(this.o.minSpeechMs)) return null;
    // Keep only a short tail of the closing pause.
    const drop = Math.max(0, silent - this.frames(this.o.tailMs));
    const kept = parts.slice(0, parts.length - drop);
    const out = new Float32Array(kept.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of kept) { out.set(p, off); off += p.length; }
    return out;
  }
}
