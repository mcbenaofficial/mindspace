// Zen Node audio engine — a module-level singleton over one shared Web Audio
// AudioContext, mirroring the lazy-singleton pattern used elsewhere in the app
// (e.g. the LM Studio client). Zero assets, zero network: every sound is
// synthesized at runtime from a handful of oscillators and one noise buffer.
//
// Architecture:
//   - ONE shared AudioContext across every Zen Node instance on every canvas,
//     created lazily on the first play gesture (never on import — browsers
//     forbid that, and it would spin up the audio thread for nothing).
//   - Each node owns its own gain subtree (createNodeAudio) into the shared
//     context, so multiple playing nodes simply mix.
//   - The context is suspended whenever no node is playing, freeing the audio
//     thread entirely; it resumes on the next play.
//
// All scheduling uses ctx.currentTime, so chime timing stays sample-accurate
// regardless of whether the React render loop is running (the canvas can pause
// offscreen while audio keeps playing).

import type { ZenScale, ZenTone } from "../../types";

// ─── Shared context ───────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
const activeNodes = new Set<ZenNodeAudio>();

/** Lazily create (or resume) the one shared AudioContext. Safe to call on a gesture. */
export function getZenContext(): AudioContext {
  if (!ctx) {
    const AC: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Suspend the shared context iff no node is currently playing — saves the audio thread. */
function maybeSuspend(): void {
  if (ctx && ctx.state === "running" && activeNodes.size === 0) {
    void ctx.suspend();
  }
}

/** Test/inspection helper: is the shared context live and running? */
export function zenContextState(): AudioContextState | "none" {
  return ctx ? ctx.state : "none";
}

// ─── Scale system ─────────────────────────────────────────────────────────────

// Semitone offsets from the root for each scale, one octave.
const SCALE_STEPS: Record<ZenScale, number[]> = {
  maj_penta: [0, 2, 4, 7, 9],
  min_penta: [0, 3, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
};

const BASE_ROOT_HZ = 261.63; // C4

/** Expand a scale across 3 octaves, ascending, shifted by `rootShift` octaves. */
export function buildScale(scale: ZenScale, rootShift: number): number[] {
  const steps = SCALE_STEPS[scale];
  const out: number[] = [];
  const root = BASE_ROOT_HZ * Math.pow(2, rootShift);
  for (let oct = 0; oct < 3; oct++) {
    for (const semi of steps) {
      out.push(root * Math.pow(2, oct + semi / 12));
    }
  }
  return out;
}

// ─── Brown-noise buffer (shared, generated once) ──────────────────────────────

let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const len = Math.floor(c.sampleRate * 3); // 3s loop
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5; // compensate for the low amplitude of brown noise
  }
  noiseBuffer = buf;
  return buf;
}

// ─── Per-node audio handle ────────────────────────────────────────────────────

export interface ChimeOpts {
  /** Linear velocity 0..1 before chimeLevel is applied. */
  velocity?: number;
  /** Decay seconds; defaults per tone. */
  decay?: number;
  /** Absolute ctx time to fire at; defaults to now. */
  when?: number;
}

/**
 * One node's gain subtree into the shared context. Owns a dry+wet (delay) path,
 * an optional noise bed, and an optional breathing pad. Fire-and-forget voices
 * are spawned per chime and self-disconnect after decay.
 */
export class ZenNodeAudio {
  // Graph nodes are built lazily on the first play gesture (built === true),
  // so constructing the handle on mount never creates an AudioContext.
  private c: AudioContext | null = null;
  private built = false;
  private out!: GainNode; // node master (volume); ramps to 0 on pause
  private voiceBus!: GainNode; // chime sum -> dry + wet
  private wet!: GainNode; // space (delay) wet level
  private delay!: DelayNode;
  private feedback!: GainNode;
  private chimeGain = 1; // chimeLevel
  private tone: ZenTone = "triangle";
  private scaleHz: number[] = buildScale("maj_penta", 0);
  private space = 0;

  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;

  private padA: OscillatorNode | null = null;
  private padB: OscillatorNode | null = null;
  private padGain: GainNode | null = null;

  private playing = false;
  private volume = 0.55;

  /** Build the node's gain subtree the first time real audio is needed. */
  private ensure(): AudioContext {
    const c = getZenContext();
    if (this.built) return c;
    this.c = c;
    this.out = c.createGain();
    this.out.gain.value = 0; // silent until start()
    this.out.connect(c.destination);

    this.voiceBus = c.createGain();
    this.voiceBus.gain.value = 1;
    this.voiceBus.connect(this.out); // dry path

    // Wet path: voiceBus -> delay (with feedback) -> wet -> out
    this.delay = c.createDelay(1.0);
    this.delay.delayTime.value = 0.34; // 340ms
    this.feedback = c.createGain();
    this.feedback.gain.value = 0.38;
    this.wet = c.createGain();
    this.wet.gain.value = this.space; // Space control, 0..0.7
    this.voiceBus.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.out);
    this.built = true;
    return c;
  }

  // ── lifecycle ──
  start(): void {
    if (this.playing) return;
    const c = this.ensure();
    this.playing = true;
    activeNodes.add(this);
    const t = c.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(this.volume, t, 0.05);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    activeNodes.delete(this);
    if (this.built && this.c) {
      const t = this.c.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(0, t, 0.08);
    }
    maybeSuspend();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    this.stopNoiseBed();
    this.stopPad();
    activeNodes.delete(this);
    if (this.built) {
      try {
        this.out.disconnect();
        this.voiceBus.disconnect();
        this.delay.disconnect();
        this.feedback.disconnect();
        this.wet.disconnect();
      } catch {
        /* already torn down */
      }
    }
    maybeSuspend();
  }

  // ── parameter setters ──
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.playing && this.built && this.c) {
      this.out.gain.setTargetAtTime(this.volume, this.c.currentTime, 0.03);
    }
  }

  setSpace(wet: number): void {
    this.space = Math.max(0, Math.min(0.7, wet));
    if (this.built && this.c) {
      this.wet.gain.setTargetAtTime(this.space, this.c.currentTime, 0.05);
    }
  }

  setChimeLevel(level: number): void {
    this.chimeGain = Math.max(0, Math.min(1, level));
  }

  setTone(tone: ZenTone): void {
    this.tone = tone;
  }

  setScale(scale: ZenScale, rootShift: number): void {
    this.scaleHz = buildScale(scale, rootShift);
  }

  /** Frequency for a given step into the expanded ascending scale (clamped). */
  freqForStep(step: number): number {
    const i = Math.max(0, Math.min(this.scaleHz.length - 1, Math.round(step)));
    return this.scaleHz[i];
  }

  scaleLength(): number {
    return this.scaleHz.length;
  }

  // ── voices ──
  /** Fire one chime by absolute frequency. Fire-and-forget; self-disconnects. */
  chimeHz(freq: number, opts: ChimeOpts = {}): void {
    if (!this.playing) return;
    const c = this.ensure();
    const t = opts.when ?? c.currentTime;
    const decay = opts.decay ?? (this.tone === "kalimba" ? 0.4 : 1.8);
    const peak = (opts.velocity ?? 1) * this.chimeGain;
    if (peak <= 0.0001) return;

    const osc = c.createOscillator();
    osc.type = this.tone === "kalimba" ? "triangle" : this.tone;
    osc.frequency.setValueAtTime(freq, t);

    const env = c.createGain();
    const attack = 0.012;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);

    osc.connect(env);
    env.connect(this.voiceBus);
    osc.start(t);
    const stopAt = t + attack + decay + 0.05;
    osc.stop(stopAt);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  /** Fire a chime by scale step (lower step = lower note). */
  chimeStep(step: number, opts: ChimeOpts = {}): void {
    this.chimeHz(this.freqForStep(step), opts);
  }

  // ── noise bed (Rainfall, Ocean Swell) ──
  startNoiseBed(cutoff = 800, gain = 0.1): void {
    if (this.noiseSrc || !this.built || !this.c) return;
    const c = this.c;
    const src = c.createBufferSource();
    src.buffer = getNoiseBuffer(c);
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.out);
    src.start();
    this.noiseSrc = src;
    this.noiseFilter = filter;
    this.noiseGain = g;
  }

  /** Live noise params — used by Ocean Swell's LFO-driven surf. */
  setNoiseParams(cutoff: number, gain: number, smoothing = 0.1): void {
    if (!this.noiseFilter || !this.noiseGain || !this.c) return;
    const t = this.c.currentTime;
    this.noiseFilter.frequency.setTargetAtTime(Math.max(80, cutoff), t, smoothing);
    this.noiseGain.gain.setTargetAtTime(Math.max(0, gain), t, smoothing);
  }

  stopNoiseBed(): void {
    if (this.noiseSrc) {
      try {
        this.noiseSrc.stop();
        this.noiseSrc.disconnect();
        this.noiseFilter?.disconnect();
        this.noiseGain?.disconnect();
      } catch {
        /* noop */
      }
    }
    this.noiseSrc = null;
    this.noiseFilter = null;
    this.noiseGain = null;
  }

  // ── breathing pad (Breathing Orb) ──
  startPad(): void {
    if (this.padA || !this.built || !this.c) return;
    const c = this.c;
    const a = c.createOscillator();
    const b = c.createOscillator();
    a.type = "sine";
    b.type = "sine";
    a.frequency.value = 110;
    b.frequency.value = 110.6; // ~0.6Hz beat
    const g = c.createGain();
    g.gain.value = 0;
    a.connect(g);
    b.connect(g);
    g.connect(this.out);
    a.start();
    b.start();
    this.padA = a;
    this.padB = b;
    this.padGain = g;
  }

  /** Swell the pad gain toward `gain` (breath phase drives this). */
  setPadGain(gain: number, smoothing = 0.6): void {
    if (!this.padGain || !this.c) return;
    this.padGain.gain.setTargetAtTime(Math.max(0, gain), this.c.currentTime, smoothing);
  }

  stopPad(): void {
    if (this.padA) {
      try {
        this.padA.stop();
        this.padB?.stop();
        this.padA.disconnect();
        this.padB?.disconnect();
        this.padGain?.disconnect();
      } catch {
        /* noop */
      }
    }
    this.padA = null;
    this.padB = null;
    this.padGain = null;
  }

  /** Crossfade helper for variation switching: brief duck of the voice bus. */
  duckVoices(seconds = 0.5): void {
    if (!this.built || !this.c) return;
    const t = this.c.currentTime;
    this.voiceBus.gain.cancelScheduledValues(t);
    this.voiceBus.gain.setValueAtTime(0.0001, t);
    this.voiceBus.gain.setTargetAtTime(1, t + seconds * 0.4, seconds * 0.3);
  }
}

export function createNodeAudio(): ZenNodeAudio {
  return new ZenNodeAudio();
}
