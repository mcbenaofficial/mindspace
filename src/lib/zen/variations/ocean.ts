// Ocean Swell — layered sine waves roll horizontally across the canvas at
// different wavelengths and speeds, rendered as translucent stacked bands.
// Audio is purely textural: a filtered noise source whose lowpass cutoff and
// gain rise and fall on a slow LFO, producing the swell-and-retreat of surf.
// No melodic notes — the pure-noise option for people who find chimes
// distracting.

import type { ZenVariationModule } from "./types";

interface Layer {
  amp: number;
  wavelength: number; // px
  speed: number;
  baseY: number; // fraction of H
  phase: number;
}

export function createOcean(): ZenVariationModule {
  let layers: Layer[] = [];
  let lfoPhase = 0;
  let noiseStarted = false;

  function build(): void {
    layers = [
      { amp: 18, wavelength: 320, speed: 0.18, baseY: 0.5, phase: 0 },
      { amp: 26, wavelength: 460, speed: -0.12, baseY: 0.62, phase: 1.2 },
      { amp: 22, wavelength: 600, speed: 0.09, baseY: 0.74, phase: 2.6 },
      { amp: 30, wavelength: 800, speed: -0.06, baseY: 0.86, phase: 4.1 },
    ];
  }

  return {
    init(env) {
      build();
      lfoPhase = 0;
      env.audio.startNoiseBed(500, env.settings.ambienceLevel * 0.3);
      noiseStarted = true;
    },

    step(dt, ctx, env, W, H) {
      if (!noiseStarted) {
        env.audio.startNoiseBed(500, env.settings.ambienceLevel * 0.3);
        noiseStarted = true;
      }
      const speed = env.settings.speed;
      // LFO drives the surf: cutoff + gain swell over swellPeriod seconds.
      const period = Math.max(4, env.settings.swellPeriod || 10);
      lfoPhase += (dt / period) * Math.PI * 2;
      const lfo = 0.5 + 0.5 * Math.sin(lfoPhase); // 0..1
      const depth = Math.max(0, Math.min(1, env.settings.intensity));
      const cutoff = 350 + lfo * 1400 * depth + 200;
      const gain = env.settings.ambienceLevel * (0.12 + lfo * 0.28 * depth);
      env.audio.setNoiseParams(cutoff, gain, 0.15);

      for (const l of layers) l.phase += l.speed * dt * speed;

      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const baseHue = 205;
      for (let li = 0; li < layers.length; li++) {
        const l = layers[li];
        const y0 = l.baseY * H;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 6) {
          const swell = 1 + lfo * depth * 0.6;
          const y =
            y0 +
            Math.sin((x / l.wavelength) * Math.PI * 2 + l.phase * Math.PI * 2) *
              l.amp *
              swell;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        const alpha = 0.18 + li * 0.06;
        ctx.fillStyle = `hsla(${baseHue + li * 6}, 70%, ${env.dark ? 45 : 55}%, ${alpha})`;
        ctx.fill();
      }
    },

    dispose(env) {
      env.audio.stopNoiseBed();
      noiseStarted = false;
    },
  };
}
