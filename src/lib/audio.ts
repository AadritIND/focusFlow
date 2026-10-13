import type { Ambient, Chime } from './types';

/** Every sound in the app is synthesised — nothing to download, nothing to cache. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  context();
}

/* ------------------------------------------------------------------ */
/* Chimes                                                              */
/* ------------------------------------------------------------------ */

function tone(out: AudioNode, freq: number, at: number, duration: number, gain: number, ac: AudioContext) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.014);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(env);
  env.connect(out);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

export function playChime(kind: Chime, volume: number): void {
  if (kind === 'off' || volume <= 0) return;
  const ac = context();
  if (!ac || !master) return;
  const out = ac.createGain();
  out.gain.value = Math.pow(volume / 100, 1.7);
  out.connect(master);
  const now = ac.currentTime + 0.02;

  if (kind === 'bell') {
    [0, 1.1].forEach((offset) => {
      [1, 2.76, 5.4].forEach((ratio, i) => tone(out, 523.25 * ratio, now + offset, 2.6 / (i + 1), 0.5 / (i + 1), ac));
    });
  } else if (kind === 'triad') {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(out, f, now + i * 0.16, 1.9, 0.34, ac));
  } else {
    [0, 0.35].forEach((offset) => {
      [1318.5, 1975.5, 2637].forEach((f, i) => tone(out, f, now + offset, 0.5 + 1.2 / (i + 1), 0.28 / (i + 1), ac));
    });
  }
}

/** A soft two-note cue for clicking around, kept quiet on purpose. */
export function playTick(volume: number): void {
  const ac = context();
  if (!ac || !master) return;
  const out = ac.createGain();
  out.gain.value = Math.pow(volume / 100, 2) * 0.1;
  out.connect(master);
  tone(out, 880, ac.currentTime + 0.01, 0.12, 0.4, ac);
}

/* ------------------------------------------------------------------ */
/* Ambient soundscapes                                                 */
/* ------------------------------------------------------------------ */

let ambientNodes: { source: AudioBufferSourceNode; gain: GainNode; filters: BiquadFilterNode[]; lfo?: OscillatorNode } | null =
  null;
let noiseBuffer: AudioBuffer | null = null;

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const seconds = 4;
  const buffer = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    // Brown-ish noise: integrate white noise and leak a little each step.
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  noiseBuffer = buffer;
  return buffer;
}

function buildChain(ac: AudioContext, kind: Ambient, volume: number) {
  const source = ac.createBufferSource();
  source.buffer = noise(ac);
  source.loop = true;

  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.connect(master ?? ac.destination);

  const filters: BiquadFilterNode[] = [];
  const chain: AudioNode[] = [source];

  if (kind === 'brown') {
    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    filters.push(low);
    chain.push(low);
  } else if (kind === 'rain') {
    const high = ac.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 900;
    const band = ac.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.value = 7200;
    filters.push(high, band);
    chain.push(high, band);
  } else {
    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;
    filters.push(low);
    chain.push(low);
  }

  chain.push(gain);
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);

  let lfo: OscillatorNode | undefined;
  if (kind === 'cafe' && filters.length) {
    // Slow drift on the filter makes the room feel occupied rather than static.
    lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ac.createGain();
    depth.gain.value = 260;
    lfo.connect(depth);
    depth.connect(filters[0].frequency);
    lfo.start();
  }

  source.start();
  gain.gain.setTargetAtTime(Math.pow(volume / 100, 1.6) * 0.5, ac.currentTime, 0.6);
  ambientNodes = { source, gain, filters, lfo };
}

export function playAmbient(kind: Ambient, volume: number): void {
  const ac = context();
  if (!ac) return;
  stopAmbient();
  if (kind === 'off' || volume <= 0) return;
  buildChain(ac, kind, volume);
}

export function stopAmbient(): void {
  if (!ambientNodes) return;
  const { source, gain, lfo } = ambientNodes;
  const ac = ctx;
  ambientNodes = null;
  if (ac) {
    gain.gain.setTargetAtTime(0, ac.currentTime, 0.25);
    const node = source;
    window.setTimeout(() => {
      try {
        node.stop();
        lfo?.stop();
      } catch {
        /* already stopped */
      }
    }, 700);
  }
}

export function setAmbientVolume(volume: number): void {
  if (!ambientNodes || !ctx) return;
  ambientNodes.gain.gain.setTargetAtTime(Math.pow(volume / 100, 1.6) * 0.5, ctx.currentTime, 0.2);
}
