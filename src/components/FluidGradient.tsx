import { CSSProperties } from "react";

/**
 * Animated fluid gradient with film grain overlay.
 *
 * Four radial-gradient "blobs" drift independently via CSS keyframes.
 * Grain is a tiny embedded SVG fractalNoise rendered via background-image
 * and blended with overlay so it textures the colors without obscuring them.
 *
 * Colors extracted from the reference images:
 *   warm orange-red  #d84820
 *   teal / mint      #4a9090
 *   deep blue        #1830b0
 *   indigo           #381870
 */

// Fractal noise tile embedded as a data-URI background image.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.70' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23g)'/%3E%3C/svg%3E")`;

interface FluidGradientProps {
  style?: CSSProperties;
  className?: string;
  /** 0–1 opacity for the colour blobs. Default 0.55. */
  intensity?: number;
  /** 0–1 opacity for the grain overlay. Default 0.14. */
  grainOpacity?: number;
}

export function FluidGradient({
  style,
  className,
  intensity = 0.55,
  grainOpacity = 0.14,
}: FluidGradientProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#060610",
        ...style,
      }}
    >
      {/* ── Warm orange-red — upper-left drift ────────────────────────── */}
      <div style={{
        position: "absolute",
        width: "90%", height: "85%",
        top: "5%", left: "-5%",
        borderRadius: "50%",
        background: "radial-gradient(ellipse at 45% 45%, rgba(216,72,32,0.90) 0%, rgba(180,48,18,0.45) 38%, transparent 68%)",
        opacity: intensity,
        animation: "ms-blob-1 30s ease-in-out infinite",
        willChange: "transform",
        pointerEvents: "none",
      }} />

      {/* ── Teal — right-side drift ───────────────────────────────────── */}
      <div style={{
        position: "absolute",
        width: "75%", height: "80%",
        top: "15%", right: "-8%",
        borderRadius: "50%",
        background: "radial-gradient(ellipse at 55% 50%, rgba(74,144,136,0.85) 0%, rgba(36,100,100,0.38) 42%, transparent 68%)",
        opacity: intensity,
        animation: "ms-blob-2 38s ease-in-out infinite",
        willChange: "transform",
        pointerEvents: "none",
      }} />

      {/* ── Deep blue — bottom-centre drift ──────────────────────────── */}
      <div style={{
        position: "absolute",
        width: "80%", height: "75%",
        bottom: "-5%", left: "10%",
        borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 60%, rgba(24,48,176,0.92) 0%, rgba(36,56,160,0.42) 40%, transparent 68%)",
        opacity: intensity,
        animation: "ms-blob-3 44s ease-in-out infinite",
        willChange: "transform",
        pointerEvents: "none",
      }} />

      {/* ── Indigo — top-right slow drift ────────────────────────────── */}
      <div style={{
        position: "absolute",
        width: "60%", height: "65%",
        top: "-5%", right: "5%",
        borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 45%, rgba(56,24,112,0.80) 0%, rgba(40,55,200,0.32) 48%, transparent 70%)",
        opacity: intensity * 0.85,
        animation: "ms-blob-4 24s ease-in-out infinite",
        willChange: "transform",
        pointerEvents: "none",
      }} />

      {/* ── Film grain overlay ────────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: GRAIN,
        backgroundRepeat: "repeat",
        backgroundSize: "256px 256px",
        opacity: grainOpacity,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }} />
    </div>
  );
}

export default FluidGradient;
