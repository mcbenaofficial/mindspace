// Default data factory for a newly spawned Zen Node. Playing state is never
// stored — nodes always load paused (autoplay on canvas open is hostile and
// violates the browser gesture requirement anyway).

import type { ZenNodeData } from "../../types";

export function zenDefaults(): ZenNodeData {
  return {
    variation: "pendulum",
    volume: 0.55,
    speed: 1,
    density: 8,
    scale: "maj_penta",
    rootShift: 0,
    tone: "triangle",
    space: 0.25,
    chimeLevel: 0.8,
    ambienceLevel: 0.5,
    breathPreset: "478",
    padOn: true,
    chimeProbability: 0.5,
    swellPeriod: 10,
    intensity: 0.6,
    timerMinutes: null,
    presets: [],
  };
}
