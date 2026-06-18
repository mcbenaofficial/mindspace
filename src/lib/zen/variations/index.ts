// Registry of Zen variations. Adding variation #7 = one new file + one line here.

import type { ZenVariation } from "../../../types";
import type { ZenVariationFactory, ZenVariationModule } from "./types";
import { createPendulum } from "./pendulum";
import { createOrbits } from "./orbits";
import { createRain } from "./rain";
import { createBreath } from "./breath";
import { createFireflies } from "./fireflies";
import { createOcean } from "./ocean";

export type { ZenEnv, ZenVariationModule } from "./types";

export const VARIATION_FACTORIES: Record<ZenVariation, ZenVariationFactory> = {
  pendulum: createPendulum,
  orbits: createOrbits,
  rain: createRain,
  breath: createBreath,
  fireflies: createFireflies,
  ocean: createOcean,
};

export const VARIATION_LABELS: Record<ZenVariation, string> = {
  pendulum: "Pendulum Wave",
  orbits: "Polyrhythm Orbits",
  rain: "Rainfall",
  breath: "Breathing Orb",
  fireflies: "Fireflies",
  ocean: "Ocean Swell",
};

/** Order shown in the variation switcher. */
export const VARIATION_ORDER: ZenVariation[] = [
  "pendulum",
  "orbits",
  "rain",
  "breath",
  "fireflies",
  "ocean",
];

export function createVariation(v: ZenVariation): ZenVariationModule {
  return VARIATION_FACTORIES[v]();
}

/** Which variations are melodic (expose scale/root/tone/chime controls). */
export const MELODIC: Record<ZenVariation, boolean> = {
  pendulum: true,
  orbits: true,
  rain: true,
  breath: true,
  fireflies: true,
  ocean: false, // pure noise, no notes
};
