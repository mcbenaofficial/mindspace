// Synthesized UI sounds via Web Audio API (no external files needed)
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function synth(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.15,
  decay = 0.8
) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gainNode = c.createGain();
  osc.connect(gainNode);
  gainNode.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * decay, c.currentTime + duration);
  gainNode.gain.setValueAtTime(gain, c.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

let soundEnabled = true;
let volume = 0.7;

export function setSoundEnabled(v: boolean) { soundEnabled = v; }
export function setSoundVolume(v: number) { volume = v; }

export const sounds = {
  spawn: () => soundEnabled && synth(440, 0.12, "sine", 0.12 * volume),
  connect: () => soundEnabled && synth(520, 0.18, "sine", 0.14 * volume, 0.6),
  cut: () => soundEnabled && synth(220, 0.1, "sawtooth", 0.08 * volume, 1.2),
  delete: () => soundEnabled && synth(180, 0.15, "triangle", 0.1 * volume, 1.5),
  complete: () => {
    if (!soundEnabled) return;
    synth(523, 0.1, "sine", 0.12 * volume);
    setTimeout(() => synth(659, 0.1, "sine", 0.12 * volume), 100);
    setTimeout(() => synth(784, 0.15, "sine", 0.12 * volume), 200);
  },
  click: () => soundEnabled && synth(600, 0.06, "sine", 0.08 * volume),
  open: () => soundEnabled && synth(380, 0.1, "sine", 0.1 * volume, 0.7),
  save: () => soundEnabled && synth(660, 0.08, "sine", 0.1 * volume, 0.9),
  error: () => soundEnabled && synth(200, 0.2, "sawtooth", 0.1 * volume, 1.0),
};
