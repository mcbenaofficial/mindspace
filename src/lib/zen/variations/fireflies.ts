// Fireflies — points drift on slow Perlin-noise paths across a dark-leaning
// field, each pulsing in brightness on its own cycle. When two pass within a
// proximity threshold both flare and a soft high bell sounds (rare, earned).
// Over time the flies weakly entrain their pulse phases to neighbours
// (Kuramoto-style coupling), so the field drifts toward loose synchrony.

import { makePerlin } from "../perlin";
import type { ZenEnv, ZenVariationModule } from "./types";

interface Fly {
  nx: number; // perlin sample coords (drift)
  ny: number;
  x: number;
  y: number;
  phase: number; // pulse phase
  rate: number; // pulse speed
  flare: number; // 0..1 transient flare
}

const COUPLING = 0.06; // Kuramoto coupling constant (very low)
const PROX = 46; // px proximity threshold

export function createFireflies(): ZenVariationModule {
  const noise = makePerlin();
  let flies: Fly[] = [];
  let count = 0;
  let tAccum = 0;

  function build(env: ZenEnv): void {
    count = Math.max(15, Math.min(25, Math.round(env.settings.density)));
    flies = Array.from({ length: count }, (_, i) => ({
      nx: Math.random() * 100,
      ny: Math.random() * 100 + i,
      x: Math.random(),
      y: Math.random(),
      phase: Math.random() * Math.PI * 2,
      rate: 0.6 + Math.random() * 0.7,
      flare: 0,
    }));
  }

  return {
    init(env) {
      build(env);
    },

    step(dt, ctx, env, W, H) {
      const want = Math.max(15, Math.min(25, Math.round(env.settings.density)));
      if (want !== count) build(env);
      const speed = env.settings.speed;
      tAccum += dt * speed;

      if (ctx) {
        // Dark-leaning field regardless of theme.
        ctx.fillStyle = env.dark ? "rgba(8,10,20,1)" : "rgba(20,24,40,1)";
        ctx.fillRect(0, 0, W, H);
      }

      const scaleLen = env.audio.scaleLength();

      // Advance drift + pulse, with Kuramoto phase coupling toward neighbours.
      for (const f of flies) {
        f.nx += dt * 0.04 * speed;
        f.ny += dt * 0.04 * speed;
        f.x = (noise(f.nx, f.ny) * 0.5 + 0.5);
        f.y = (noise(f.nx + 50, f.ny + 50) * 0.5 + 0.5);
        f.phase += dt * f.rate * speed * Math.PI;
        if (f.flare > 0) f.flare = Math.max(0, f.flare - dt * 1.5);
      }

      // Pairwise proximity → flare + coupling + (probabilistic) chime.
      for (let i = 0; i < flies.length; i++) {
        const a = flies[i];
        const ax = a.x * W;
        const ay = a.y * H;
        for (let j = i + 1; j < flies.length; j++) {
          const b = flies[j];
          const bx = b.x * W;
          const by = b.y * H;
          const d = Math.hypot(ax - bx, ay - by);
          if (d < PROX) {
            // Kuramoto: nudge phases toward each other.
            const diff = Math.sin(b.phase - a.phase);
            a.phase += COUPLING * diff * dt;
            b.phase -= COUPLING * diff * dt;
            // Flare on fresh contact (only when not already flaring).
            if (a.flare < 0.1 && b.flare < 0.1) {
              if (!env.reducedMotion) {
                a.flare = 1;
                b.flare = 1;
              }
              if (Math.random() < env.settings.chimeProbability) {
                // High, quiet bell with long decay.
                const step = scaleLen - 1 - Math.floor(Math.random() * 4);
                env.audio.chimeStep(step, { velocity: 0.22, decay: 2.2 });
              }
            }
          }
        }
      }

      if (!ctx) return;
      for (const f of flies) {
        const x = f.x * W;
        const y = f.y * H;
        const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(f.phase));
        const bright = Math.min(1, pulse + f.flare);
        const r = 2 + bright * 3 + f.flare * 4;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, `rgba(220,255,180,${0.9 * bright})`);
        g.addColorStop(1, "rgba(220,255,180,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    dispose() {
      /* none */
    },
  };
}
