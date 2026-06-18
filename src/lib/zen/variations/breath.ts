// Breathing Orb — a guided breathing cycle. A filled circle eases outward
// (inhale), holds, then eases back (exhale). A low detuned sine pad swells and
// fades with the orb; a soft chime marks each phase transition. The only
// actively therapeutic variation. Speed is intentionally ignored — breath
// timing is the therapy and should not be casually scaled.

import type { ZenEnv, ZenVariationModule } from "./types";

interface Phase {
  name: string;
  dur: number; // seconds
  from: number; // orb scale at start (0..1)
  to: number; // orb scale at end
}

const PRESETS: Record<string, Phase[]> = {
  "478": [
    { name: "Breathe in", dur: 4, from: 0, to: 1 },
    { name: "Hold", dur: 7, from: 1, to: 1 },
    { name: "Breathe out", dur: 8, from: 1, to: 0 },
  ],
  box: [
    { name: "Breathe in", dur: 4, from: 0, to: 1 },
    { name: "Hold", dur: 4, from: 1, to: 1 },
    { name: "Breathe out", dur: 4, from: 1, to: 0 },
    { name: "Hold", dur: 4, from: 0, to: 0 },
  ],
};

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function createBreath(): ZenVariationModule {
  let phases = PRESETS["478"];
  let presetKey = "478";
  let idx = 0;
  let elapsed = 0;
  let padOn = true;
  let status = "Breathe in — 4";

  function resetIfPresetChanged(env: ZenEnv): void {
    const key = env.settings.breathPreset === "box" ? "box" : "478";
    if (key !== presetKey) {
      presetKey = key;
      phases = PRESETS[key];
      idx = 0;
      elapsed = 0;
    }
  }

  return {
    init(env) {
      presetKey = env.settings.breathPreset === "box" ? "box" : "478";
      phases = PRESETS[presetKey];
      idx = 0;
      elapsed = 0;
      padOn = env.settings.padOn;
      if (padOn) env.audio.startPad();
    },

    step(dt, ctx, env, W, H) {
      resetIfPresetChanged(env);

      // Pad toggle can change live.
      if (env.settings.padOn && !padOn) {
        env.audio.startPad();
        padOn = true;
      } else if (!env.settings.padOn && padOn) {
        env.audio.stopPad();
        padOn = false;
      }

      // NOTE: deliberately NOT multiplied by speed.
      elapsed += dt;
      const phase = phases[idx];
      if (elapsed >= phase.dur) {
        elapsed -= phase.dur;
        idx = (idx + 1) % phases.length;
        env.audio.chimeStep(Math.floor(env.audio.scaleLength() / 2), {
          velocity: 0.3,
          decay: 1.4,
        });
      }
      const cur = phases[idx];
      const p = Math.min(1, elapsed / cur.dur);
      const scale = cur.from + (cur.to - cur.from) * easeInOut(p);
      const remain = Math.ceil(cur.dur - elapsed);
      status = `${cur.name} — ${remain}`;

      if (padOn) env.audio.setPadGain(0.12 * scale, 0.5);

      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H * 0.44;
      const minR = Math.min(W, H) * 0.1;
      const maxR = Math.min(W * 0.42, H * 0.34);
      const r = minR + (maxR - minR) * scale;

      // Halo.
      const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.5);
      grad.addColorStop(0, env.dark ? "rgba(120,160,255,0.45)" : "rgba(90,130,230,0.4)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = env.dark ? "rgba(150,185,255,0.9)" : "rgba(80,120,225,0.85)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Phase label + countdown.
      ctx.fillStyle = env.fg;
      ctx.textAlign = "center";
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.fillText(cur.name, cx, cy + maxR + 34);
      ctx.font = "700 22px system-ui, sans-serif";
      ctx.fillText(String(remain), cx, cy + maxR + 60);
    },

    dispose(env) {
      env.audio.stopPad();
      padOn = false;
    },

    phaseText() {
      return status;
    },
  };
}
