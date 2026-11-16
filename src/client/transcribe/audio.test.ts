import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, Resampler } from './wav';
import { rms, Utterances } from './vad';
import { checkWav } from '../../server/transcripts';

const RATE = 16_000;
const tone = (ms: number, amp = 0.2, rate = RATE, hz = 220) => Float32Array.from({ length: Math.round(rate * ms / 1000) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / rate));
const hiss = (ms: number, amp = 0.0005) => Float32Array.from({ length: Math.round(RATE * ms / 1000) }, (_, i) => amp * Math.sin(i * 1.7) * Math.cos(i * 0.31));
const join = (...parts: Float32Array[]) => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const ms = (samples: Float32Array) => samples.length / RATE * 1000;

test('encodeWav: a 16 kHz mono 16-bit PCM file the server accepts', () => {
  const wav = encodeWav(tone(500));
  const v = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...wav.subarray(8, 16)), 'WAVEfmt ');
  assert.equal(v.getUint16(22, true), 1, 'mono');
  assert.equal(v.getUint32(24, true), 16_000);
  assert.equal(v.getUint16(34, true), 16, '16-bit');
  assert.equal(v.getUint32(40, true), 8000 * 2);
  assert.equal(wav.length, 44 + 16_000);
  const checked = checkWav(Buffer.from(wav));
  assert.ok('seconds' in checked && Math.abs(checked.seconds - 0.5) < 1e-9);
});

test('encodeWav: clips and scales samples', () => {
  const wav = encodeWav(Float32Array.from([0, 1, -1, 2, -2, 0.5]));
  const v = new DataView(wav.buffer);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => v.getInt16(44 + i * 2, true)), [0, 32767, -32768, 32767, -32768, 16384]);
});

test('Resampler: 48 kHz to 16 kHz keeps the length and the signal, across chunk edges', () => {
  const r = new Resampler(48_000);
  const src = tone(1000, 0.5, 48_000, 300);
  const out: Float32Array[] = [];
  for (let i = 0; i < src.length; i += 1000) out.push(r.push(src.subarray(i, i + 1000))); // 1000 isn't a multiple of 3
  const all = join(...out);
  assert.ok(Math.abs(all.length - 16_000) <= 1, `length ${all.length}`);
  const expected = tone(1000, 0.5, 16_000, 300);
  assert.ok(Math.abs(rms(all) - rms(expected)) < 0.01);
});

test('Resampler: 44.1 kHz (a fractional step) gives about the right number of samples', () => {
  const r = new Resampler(44_100);
  let n = 0;
  for (let i = 0; i < 100; i++) n += r.push(new Float32Array(441)).length;
  assert.ok(Math.abs(n - 16_000) <= 1, `got ${n}`);
  assert.equal(new Resampler(16_000).push(Float32Array.from([1, 2])).length, 2);
});

test('VAD: speech between pauses comes out as one utterance, with a little lead-in and tail', () => {
  const vad = new Utterances();
  const out = [
    ...vad.push(hiss(1000)),
    ...vad.push(tone(1500)),
    ...vad.push(hiss(500)), // a short pause doesn't end it
    ...vad.push(tone(800)),
  ];
  assert.equal(out.length, 0, 'still talking');
  assert.equal(vad.speaking, true);
  out.push(...vad.push(hiss(1000)));
  assert.equal(out.length, 1);
  const len = ms(out[0]);
  assert.ok(len > 2800 + 250 && len < 2800 + 300 + 300, `length ${len} ms`);
  assert.equal(vad.speaking, false);
});

test('VAD: silence and short clicks make nothing', () => {
  const vad = new Utterances();
  assert.deepEqual(vad.push(hiss(3000)), []);
  assert.deepEqual(vad.push(join(tone(40), hiss(1000))), [], 'too short to start');
  assert.deepEqual(vad.push(join(tone(140), hiss(1500))), [], 'started but under the minimum speech');
  assert.equal(vad.flush(), null);
});

test('VAD: long speech is cut at 15 seconds and goes on in the next utterance', () => {
  const vad = new Utterances();
  vad.push(hiss(500));
  const out = vad.push(tone(20_000));
  assert.equal(out.length, 1);
  assert.ok(Math.abs(ms(out[0]) - 15_000) <= 20, `first ${ms(out[0])} ms`);
  out.push(...vad.push(hiss(1000)));
  assert.equal(out.length, 2);
  assert.ok(ms(out[1]) > 5000 && ms(out[1]) <= 5600, `second ${ms(out[1])} ms`);
});

test('VAD: flush ends the utterance under way (push to talk let go); reset drops it', () => {
  const vad = new Utterances();
  vad.push(hiss(500)); vad.push(tone(1000));
  const u = vad.flush();
  assert.ok(u && ms(u) >= 1000);
  assert.equal(vad.speaking, false);
  vad.push(tone(1000));
  vad.reset();
  assert.equal(vad.flush(), null);
});

test('VAD: a steady loud background raises the bar', () => {
  const vad = new Utterances();
  // A fan at about -40 dBFS: quieter than the floor at first, then learnt.
  assert.deepEqual(vad.push(hiss(3000, 0.004)), []);
  // A voice well above it still counts.
  vad.push(tone(1000, 0.2));
  assert.ok(vad.push(hiss(1000, 0.004)).length === 1);
});
