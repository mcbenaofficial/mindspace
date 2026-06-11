import { useEffect, useRef } from "react";

/**
 * Animated 8-petal logo.
 *
 * A linearGradient rotating through four fluid colours is applied to the
 * petals.  All animation is driven by requestAnimationFrame with direct DOM
 * mutations so React never re-renders during playback.
 *
 * Grain is added via an SVG feTurbulence filter that overlays fractal noise
 * on top of the gradient fill.
 *
 * Colours (from the reference fluid-gradient images):
 *   #d84820  warm orange-red
 *   #4a9090  teal / mint
 *   #1830b0  deep blue
 *   #381870  indigo / deep purple
 */

const PETAL = "M 0,-18 C 5,-21 13,-29 14,-37 C 15,-46 8,-54 0,-54 C -8,-54 -15,-46 -14,-37 C -13,-29 -5,-21 0,-18 Z";
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

// Fluid colour palette as [r, g, b] tuples.  Last entry mirrors the first so
// the transition loop closes smoothly.
const PALETTE: [number, number, number][] = [
  [216, 72,  32],   // warm orange-red
  [74,  144, 136],  // teal
  [24,  48,  176],  // deep blue
  [56,  24,  112],  // indigo
  [216, 72,  32],   // close the loop
];

const COLOUR_CYCLE_MS = 10_000; // one colour-phase transition
const ROTATION_MS     = 28_000; // full gradient angle rotation

function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${lerp(a[0], b[0], t)},${lerp(a[1], b[1], t)},${lerp(a[2], b[2], t)})`;
}

// Stable IDs — generated once at module load so multiple logo instances on a
// page each get their own gradient/filter without clashing.
let _uid = 0;
function uid() { return ++_uid; }

interface MindSpaceLogoProps {
  size?: number;
  /** Ignored — kept for API compatibility; logo always uses the fluid gradient. */
  color?: string;
  className?: string;
}

export function MindSpaceLogo({ size = 32, className }: MindSpaceLogoProps) {
  const idRef = useRef(uid());
  const gradId   = `ms-lg-${idRef.current}`;
  const filterId = `ms-lf-${idRef.current}`;

  const stop1Ref = useRef<SVGStopElement>(null);
  const stop2Ref = useRef<SVGStopElement>(null);
  const stop3Ref = useRef<SVGStopElement>(null);
  const gradRef  = useRef<SVGLinearGradientElement>(null);
  const rafRef   = useRef(0);
  const t0Ref    = useRef(0);

  useEffect(() => {
    const n = PALETTE.length - 1; // number of distinct transitions

    function frame(ts: number) {
      if (!t0Ref.current) t0Ref.current = ts;
      const elapsed = ts - t0Ref.current;

      // ── Colour cycling ──────────────────────────────────────────────
      const phase    = (elapsed % (COLOUR_CYCLE_MS * n)) / COLOUR_CYCLE_MS;
      const idx      = Math.floor(phase) % n;
      const localT   = ease(phase - Math.floor(phase));
      const c1 = PALETTE[idx];
      const c2 = PALETTE[idx + 1];
      const c3 = PALETTE[(idx + 2) % PALETTE.length];

      stop1Ref.current?.setAttribute("stop-color", lerpRgb(c1, c2, localT));
      stop2Ref.current?.setAttribute("stop-color", lerpRgb(c2, c3, localT));
      stop3Ref.current?.setAttribute("stop-color", lerpRgb(c3, c1, localT));

      // ── Gradient angle rotation ─────────────────────────────────────
      // viewBox is -60..60 on both axes; centre (0,0), radius 72 for endpoints
      // slightly outside the shape so the gradient sweeps fully.
      if (gradRef.current) {
        const angle = (elapsed / ROTATION_MS) * Math.PI * 2;
        const R = 72;
        gradRef.current.setAttribute("x1", (Math.cos(angle + Math.PI) * R).toFixed(1));
        gradRef.current.setAttribute("y1", (Math.sin(angle + Math.PI) * R).toFixed(1));
        gradRef.current.setAttribute("x2", (Math.cos(angle)           * R).toFixed(1));
        gradRef.current.setAttribute("y2", (Math.sin(angle)           * R).toFixed(1));
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <svg
      width={size}
      height={size}
      viewBox="-60 -60 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="MindSpace"
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* Animated gradient — endpoints and stop-colours mutated by rAF */}
        <linearGradient
          ref={gradRef}
          id={gradId}
          x1="-60" y1="-60" x2="60" y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop ref={stop1Ref} offset="0%"   stopColor="#d84820" />
          <stop ref={stop2Ref} offset="50%"  stopColor="#4a9090" />
          <stop ref={stop3Ref} offset="100%" stopColor="#1830b0" />
        </linearGradient>

        {/* Film-grain filter: fractal noise blended over the filled petals */}
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.68"
            numOctaves="4"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix type="saturate" values="0" in="noise" result="gray" />
          <feComposite in="gray" in2="SourceGraphic" operator="in" result="clipped" />
          <feBlend in="SourceGraphic" in2="clipped" mode="soft-light" />
        </filter>
      </defs>

      {/* Petals with animated gradient fill + grain filter */}
      <g filter={`url(#${filterId})`}>
        {ANGLES.map(angle => (
          <path
            key={angle}
            d={PETAL}
            transform={`rotate(${angle})`}
            fill={`url(#${gradId})`}
          />
        ))}
      </g>

      {/* Subtle white specular highlight on the top-left petal cluster */}
      <g opacity="0.18" style={{ pointerEvents: "none" }}>
        {[315, 0, 45].map(angle => (
          <path
            key={angle}
            d={PETAL}
            transform={`rotate(${angle})`}
            fill="white"
          />
        ))}
      </g>
    </svg>
  );
}

export default MindSpaceLogo;
