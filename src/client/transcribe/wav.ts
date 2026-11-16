// Pure audio helpers for transcripts (no DOM): resampling to 16 kHz and
// writing a 16-bit mono WAV, the format the Whisper server reads best.

/** Downsamples mono float samples from `fromRate` to `toRate` (16 kHz), each
 *  output sample the average of the source samples behind it (a simple
 *  low-pass, enough for speech). Works on a stream: call push() per chunk. */
export class Resampler {
  private pos = 0; // where the next output sample starts, in source samples from the next chunk's start
  private carry = new Float32Array(0);
  constructor(readonly fromRate: number, readonly toRate = 16_000) {
    if (!(fromRate > 0) || !(toRate > 0)) throw new Error('Bad sample rate');
  }

  push(input: Float32Array): Float32Array {
    if (this.fromRate === this.toRate) return input.slice();
    const step = this.fromRate / this.toRate;
    let src = input;
    if (this.carry.length) { src = new Float32Array(this.carry.length + input.length); src.set(this.carry); src.set(input, this.carry.length); }
    const out: number[] = [];
    let pos = this.pos;
    while (pos + step <= src.length) {
      const a = Math.floor(pos), b = Math.max(a + 1, Math.min(src.length, Math.floor(pos + step)));
      let sum = 0;
      for (let i = a; i < b; i++) sum += src[i];
      out.push(sum / (b - a));
      pos += step;
    }
    const keepFrom = Math.floor(pos);
    this.carry = src.slice(keepFrom);
    this.pos = pos - keepFrom;
    return Float32Array.from(out);
  }
}

/** A 16-bit PCM mono WAV file of these samples (-1..1, clipped). */
export function encodeWav(samples: Float32Array, rate = 16_000): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return bytes;
}
