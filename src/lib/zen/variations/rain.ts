// Rainfall — drops spawn at random x, fall, and splash into an elliptical ripple
// on a floor line, each splash a soft random-note pluck with a long 2.4s decay.
// A filtered brown-noise bed plays underneath at low gain. The best variation
// for masking environmental noise.

import type { ZenVariationModule } from "./types";

interface Drop {
  x: number;
  y: number;
  vy: number;
}
interface Ripple {
  x: number;
  age: number;
  life: number;
}

export function createRain(): ZenVariationModule {
  let drops: Drop[] = [];
  let ripples: Ripple[] = [];
  let spawnAcc = 0;
  let noiseStarted = false;

  return {
    init(env) {
      drops = [];
      ripples = [];
      spawnAcc = 0;
      env.audio.startNoiseBed(900, env.settings.ambienceLevel * 0.22);
      noiseStarted = true;
    },

    step(dt, ctx, env, W, H) {
      if (!noiseStarted) {
        env.audio.startNoiseBed(900, env.settings.ambienceLevel * 0.22);
        noiseStarted = true;
      } else {
        env.audio.setNoiseParams(900, env.settings.ambienceLevel * 0.22, 0.2);
      }

      const floorY = H * 0.86;
      const speed = env.settings.speed;
      // density 4..14 → spawn rate ~1.5..14 drops/sec.
      const rate = Math.max(1, env.settings.density) * 1.1 * speed;
      spawnAcc += dt * rate;
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        drops.push({ x: Math.random() * W, y: -10, vy: (180 + Math.random() * 120) });
      }

      const scaleLen = env.audio.scaleLength();
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = env.dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(W, floorY);
        ctx.stroke();
      }

      // Drops.
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.vy * dt * speed;
        if (d.y >= floorY) {
          drops.splice(i, 1);
          ripples.push({ x: d.x, age: 0, life: 1.1 });
          const step = Math.floor(Math.random() * scaleLen);
          env.audio.chimeStep(step, { velocity: 0.4, decay: 2.4 });
          continue;
        }
        if (ctx) {
          ctx.strokeStyle = env.dark ? "rgba(140,180,255,0.55)" : "rgba(70,110,200,0.5)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x, d.y + 9);
          ctx.stroke();
        }
      }

      // Ripples.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age += dt * speed;
        if (r.age >= r.life) {
          ripples.splice(i, 1);
          continue;
        }
        if (ctx) {
          const p = r.age / r.life;
          const rw = 4 + p * 26;
          ctx.strokeStyle = env.dark
            ? `rgba(150,190,255,${0.4 * (1 - p)})`
            : `rgba(70,110,200,${0.4 * (1 - p)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(r.x, floorY, rw, rw * 0.32, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },

    dispose(env) {
      env.audio.stopNoiseBed();
      noiseStarted = false;
    },
  };
}
