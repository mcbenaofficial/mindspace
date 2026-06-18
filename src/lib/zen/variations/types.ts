// Common interface shared by every Zen variation. Adding variation #7 is a
// single new file implementing this contract plus one line in `index.ts`.

import type { ZenNodeData } from "../../../types";
import type { ZenNodeAudio } from "../../audio/zenAudio";

/** Per-frame environment handed to every variation. */
export interface ZenEnv {
  audio: ZenNodeAudio;
  /** Live settings (speed, density, scale, …). Read fresh each step. */
  settings: ZenNodeData;
  /** Theme-derived colors (resolved from CSS variables at the call site). */
  accent: string;
  fg: string;
  bg: string;
  dark: boolean;
  /** When true, honour prefers-reduced-motion: damp/disable motion. */
  reducedMotion: boolean;
}

export interface ZenVariationModule {
  /** Set up simulation state. Called on mount and on variation switch. */
  init(env: ZenEnv, W: number, H: number): void;
  /**
   * Advance the simulation by `dt` seconds and (when `ctx` is non-null) draw.
   * When `ctx` is null the node is offscreen: advance + schedule audio only,
   * skip all drawing. Audio MUST keep working in this path.
   */
  step(dt: number, ctx: CanvasRenderingContext2D | null, env: ZenEnv, W: number, H: number): void;
  /** Tear down any audio resources (noise bed, pad). */
  dispose(env: ZenEnv): void;
  /** Optional live status line (Breathing Orb exposes this via aria-live). */
  phaseText?(): string;
}

export type ZenVariationFactory = () => ZenVariationModule;
