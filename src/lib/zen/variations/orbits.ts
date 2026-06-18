// Polyrhythm Orbits — balls travel back and forth along concentric semicircular
// arcs at speeds (14+i)/30, chiming at each arc end. Denser and more rhythmic
// than Pendulum Wave; the differing speeds weave shifting polyrhythms.

import type { ZenEnv, ZenVariationModule } from "./types";

interface Arc {
  speed: number; // radians/sec base
  phase: number; // 0..π position along the arc
  dir: 1 | -1;
}

export function createOrbits(): ZenVariationModule {
  let arcs: Arc[] = [];
  let count = 0;

  function build(env: ZenEnv): void {
    count = Math.max(4, Math.min(14, Math.round(env.settings.density)));
    arcs = Array.from({ length: count }, (_, i) => ({
      speed: ((14 + i) / 30) * Math.PI * 0.5,
      phase: 0,
      dir: 1 as const,
    }));
  }

  return {
    init(env) {
      build(env);
    },

    step(dt, ctx, env, W, H) {
      if (Math.max(4, Math.min(14, Math.round(env.settings.density))) !== count) build(env);

      const cx = W / 2;
      const cy = H * 0.9;
      const maxR = Math.min(H * 0.8, W * 0.46);
      const minR = maxR * 0.18;
      const scaleLen = env.audio.scaleLength();

      if (ctx) ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < arcs.length; i++) {
        const a = arcs[i];
        a.phase += a.dir * a.speed * dt * env.settings.speed;
        if (a.phase >= Math.PI) {
          a.phase = Math.PI;
          a.dir = -1;
          fireEnd(env, i, count, scaleLen);
        } else if (a.phase <= 0) {
          a.phase = 0;
          a.dir = 1;
          fireEnd(env, i, count, scaleLen);
        }

        const r = minR + (maxR - minR) * (i / Math.max(1, count - 1));
        if (ctx) {
          // Arc track (left-to-right semicircle above the base line).
          ctx.strokeStyle = env.dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
          ctx.stroke();

          const ang = Math.PI + a.phase; // π..2π sweeps left→right
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          const hue = Math.round((i / count) * 60 + 170);
          ctx.fillStyle = `hsl(${hue}, 65%, ${env.dark ? 60 : 50}%)`;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },

    dispose() {
      /* none */
    },
  };
}

function fireEnd(env: ZenEnv, i: number, count: number, scaleLen: number): void {
  const step = Math.floor((i / Math.max(1, count - 1)) * (scaleLen - 1));
  env.audio.chimeStep(step, { velocity: 0.45 });
}
