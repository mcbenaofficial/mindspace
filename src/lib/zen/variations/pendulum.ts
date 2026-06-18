// Pendulum Wave — balls swing on lines from a single pivot between two angled
// walls. Each ball has a slightly different period, so the set drifts from
// apparent chaos into synchronized fans and snakes, then apart again. A chime
// fires when a ball reaches a wall (an extreme of its swing); the note is
// mapped to ball index (lower index = lower note).

import type { ZenEnv, ZenVariationModule } from "./types";

interface Ball {
  freq: number; // angular cycles/sec
  vel: number; // last velocity (cos of phase) for extreme detection
}

const THETA_MAX = 0.9; // radians from vertical to each wall

export function createPendulum(): ZenVariationModule {
  let balls: Ball[] = [];
  let t = 0;
  let count = 0;

  function build(env: ZenEnv): void {
    count = Math.max(4, Math.min(14, Math.round(env.settings.density)));
    balls = Array.from({ length: count }, (_, i) => ({
      // (24+i)/95 pattern — periods drift slowly out of phase.
      freq: (24 + i) / 95,
      vel: 0,
    }));
    t = 0;
  }

  return {
    init(env) {
      build(env);
    },

    step(dt, ctx, env, W, H) {
      if (Math.max(4, Math.min(14, Math.round(env.settings.density))) !== count) build(env);
      t += dt * env.settings.speed;

      const pivotX = W / 2;
      const pivotY = H * 0.16;
      const maxLen = Math.min(H * 0.72, W * 0.46);
      const scaleLen = env.audio.scaleLength();

      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        // Two angled walls.
        ctx.strokeStyle = env.dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
        ctx.lineWidth = 2;
        for (const sign of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(pivotX, pivotY);
          ctx.lineTo(
            pivotX + sign * Math.sin(THETA_MAX) * maxLen,
            pivotY + Math.cos(THETA_MAX) * maxLen,
          );
          ctx.stroke();
        }
      }

      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        const phase = 2 * Math.PI * b.freq * t;
        const angle = THETA_MAX * Math.sin(phase);
        const vel = Math.cos(phase);
        // Extreme reached when velocity changes sign → ball touches a wall.
        if (b.vel > 0 !== vel > 0 && i < count) {
          const step = Math.floor((i / Math.max(1, count - 1)) * (scaleLen - 1));
          env.audio.chimeStep(step, { velocity: 0.5 });
        }
        b.vel = vel;

        if (ctx) {
          const len = maxLen * (0.4 + 0.6 * ((i + 1) / count));
          const x = pivotX + Math.sin(angle) * len;
          const y = pivotY + Math.cos(angle) * len;
          ctx.strokeStyle = env.dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pivotX, pivotY);
          ctx.lineTo(x, y);
          ctx.stroke();
          const hue = Math.round((i / count) * 50 + 200);
          ctx.fillStyle = `hsl(${hue}, 70%, ${env.dark ? 62 : 52}%)`;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },

    dispose() {
      /* no persistent audio resources */
    },
  };
}
