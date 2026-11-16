// Reads raw samples from the microphone track voice already uses (no second
// capture, no recording): an AudioWorklet where the browser has one (Chrome,
// Firefox, Safari 14.1+), else the older ScriptProcessor. The context runs
// at the device's own rate, because Firefox can't connect a microphone to a
// context at another rate; resampling to 16 kHz happens afterwards.

export interface MicTap {
  rate: number;
  stop(): void;
}

const WORKLET = `
class PlayhallTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(2048); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('playhall-tap', PlayhallTap);
`;

export async function tapMic(track: MediaStreamTrack, onSamples: (samples: Float32Array) => void): Promise<MicTap> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  // Nodes only run when connected through to the output: through a silent gain.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);
  let node: AudioNode;
  try {
    if (!ctx.audioWorklet) throw new Error('no AudioWorklet');
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    const w = new AudioWorkletNode(ctx, 'playhall-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    w.port.onmessage = (e: MessageEvent<Float32Array>) => onSamples(e.data);
    node = w;
  } catch {
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (e) => onSamples(e.inputBuffer.getChannelData(0).slice());
    node = sp;
  }
  source.connect(node);
  node.connect(sink);
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  return {
    rate: ctx.sampleRate,
    stop: () => {
      try { source.disconnect(); node.disconnect(); sink.disconnect(); } catch { /* already gone */ }
      if (node instanceof AudioWorkletNode) node.port.onmessage = null;
      void ctx.close().catch(() => {});
    },
  };
}
