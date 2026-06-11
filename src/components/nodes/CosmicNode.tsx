import React, { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  Sparkles, Maximize2, Minimize2, Trash2,
  Zap, Drum, Atom, Crosshair, Box,
} from "lucide-react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { useStore } from "../../store";
import { MindNode, CosmicData, CosmicMode } from "../../types";

export type CosmicNodeType = Node<{ mindNode: MindNode }, "cosmic">;

// ─── Shared utility: self-sizing canvas loop ──────────────────────────────────
function useResizingCanvas(
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => void,
  deps: React.DependencyList = []
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const t0 = useRef(Date.now());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const resize = () => { canvas.width = parent.offsetWidth || 320; canvas.height = parent.offsetHeight || 220; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    const loop = () => {
      raf.current = requestAnimationFrame(loop);
      const ctx = canvas.getContext("2d");
      if (ctx) drawRef.current(ctx, canvas.width, canvas.height, (Date.now() - t0.current) / 1000);
    };
    loop();
    return () => { cancelAnimationFrame(raf.current); ro.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

// ─── 1. Ripple Grid ──────────────────────────────────────────────────────────
const RG_ROWS = 7;
const RG_COLS = 8;
const RG_GAP = 8;
const RG_BAR_H = 36;
const RG_CELL_R: [number, number, number] = [34, 34, 34];
const RG_WAVE_R: [number, number, number] = [79, 70, 229];
const RG_SHAPES = ["wave", "plus", "star"] as const;
type RGShape = typeof RG_SHAPES[number];

function rgLerp(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;
}

function rgDist(dr: number, dc: number, shape: RGShape): number {
  if (shape === "wave") return Math.hypot(dr, dc);
  if (shape === "plus") return (dr === 0 || dc === 0) ? Math.abs(dr) + Math.abs(dc) : Infinity;
  return Math.abs(dr) + Math.abs(dc); // star = Manhattan = diamond wavefront
}

function rgLayout(W: number, H: number) {
  const gridH = H - RG_BAR_H;
  const cellSz = Math.min(
    (W - RG_GAP * (RG_COLS + 1)) / RG_COLS,
    (gridH - RG_GAP * (RG_ROWS + 1)) / RG_ROWS,
  );
  const gW = RG_COLS * (cellSz + RG_GAP) + RG_GAP;
  const gH = RG_ROWS * (cellSz + RG_GAP) + RG_GAP;
  const ox = (W - gW) / 2 + RG_GAP;
  const oy = (gridH - gH) / 2 + RG_GAP;
  return { cellSz, ox, oy, gW, gH };
}

interface RGRipple { row: number; col: number; startMs: number; shape: RGShape; }

// C3 major scale across 8 columns; row shifts octave (top = high, bottom = low)
const RG_SCALE = [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63];
function rgFreqAt(row: number, col: number): number {
  return RG_SCALE[col % RG_SCALE.length] * Math.pow(2, (RG_ROWS - 1 - row) / (RG_ROWS - 1));
}

let _rgAudio: AudioContext | null = null;
function rgSound(shape: RGShape, freq: number) {
  try {
    if (!_rgAudio) _rgAudio = new AudioContext();
    if (_rgAudio.state === "suspended") _rgAudio.resume();
    const a = _rgAudio;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.connect(gain); gain.connect(a.destination);
    const [type, dur]: [OscillatorType, number] =
      shape === "wave"  ? ["sine",     0.30] :
      shape === "plus"  ? ["triangle", 0.20] :
                          ["square",   0.10];
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.09, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + dur);
    osc.start(); osc.stop(a.currentTime + dur);
  } catch (_) { /* no-op */ }
}

function RippleGridFragment() {
  const ripplesRef    = useRef<RGRipple[]>([]);
  const lastAutoMs    = useRef(0);
  const btnHoverRef   = useRef(false);
  const shapeRef      = useRef<RGShape>("wave");
  const shapeHoverRef = useRef<RGShape | null>(null);

  const triggerAt = useCallback((row: number, col: number) => {
    const now = Date.now();
    if (ripplesRef.current.length >= 5) ripplesRef.current.shift();
    ripplesRef.current.push({ row, col, startMs: now, shape: shapeRef.current });
    lastAutoMs.current = now;
    rgSound(shapeRef.current, rgFreqAt(row, col));
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    const now = Date.now();

    if (now - lastAutoMs.current > 4500) {
      lastAutoMs.current = now;
      if (ripplesRef.current.length < 5)
        ripplesRef.current.push({ row: Math.floor(RG_ROWS / 2), col: Math.floor(RG_COLS / 2), startMs: now, shape: shapeRef.current });
    }
    ripplesRef.current = ripplesRef.current.filter(r => now - r.startMs < 3000);

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    const { cellSz, ox, oy, gH } = rgLayout(W, H);

    for (let row = 0; row < RG_ROWS; row++) {
      for (let col = 0; col < RG_COLS; col++) {
        const x = ox + col * (cellSz + RG_GAP);
        const y = oy + row * (cellSz + RG_GAP);
        let peak = 0;
        for (const rp of ripplesRef.current) {
          const dist = rgDist(row - rp.row, col - rp.col, rp.shape);
          const localT = (now - rp.startMs - dist * 80) / 600;
          if (localT > 0 && localT < 1) {
            const v = localT < 0.3 ? localT / 0.3 : 1 - (localT - 0.3) / 0.7;
            if (v > peak) peak = v;
          }
        }
        if (peak > 0.5) { ctx.shadowColor = "#4f46e5"; ctx.shadowBlur = 10 * peak; }
        ctx.fillStyle = peak > 0 ? rgLerp(RG_CELL_R, RG_WAVE_R, peak) : `rgb(${RG_CELL_R.join(",")})`;
        ctx.beginPath(); ctx.roundRect(x, y, cellSz, cellSz, 4); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Center sparkle button (centered on grid area)
    const btnCY = oy + gH / 2;
    ctx.save();
    ctx.translate(W / 2, btnCY);
    ctx.scale(btnHoverRef.current ? 1.07 : 1, btnHoverRef.current ? 1.07 : 1);
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#333";
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.4;
      const r = i % 3 === 0 ? 10 : i % 3 === 1 ? 7.5 : 5.5;
      ctx.globalAlpha = i % 3 === 0 ? 1 : 0.65;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, i % 3 === 0 ? 2 : 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Shape selector bar
    const bW = 42, bH = 24, bGap = 7;
    const totalW = RG_SHAPES.length * bW + (RG_SHAPES.length - 1) * bGap;
    const bx0 = (W - totalW) / 2;
    const by  = H - RG_BAR_H + (RG_BAR_H - bH) / 2;

    RG_SHAPES.forEach((shape, i) => {
      const bx = bx0 + i * (bW + bGap);
      const active  = shapeRef.current === shape;
      const hovered = shapeHoverRef.current === shape;
      ctx.fillStyle = active ? "#4f46e5" : hovered ? "#2a2a2a" : "#181818";
      ctx.beginPath(); ctx.roundRect(bx, by, bW, bH, 6); ctx.fill();

      const icx = bx + bW / 2, icy = by + bH / 2;
      ctx.strokeStyle = active ? "#fff" : "#555";
      ctx.lineWidth = 1.5; ctx.lineCap = "round";

      if (shape === "wave") {
        [4, 7, 10].forEach((r, j) => {
          ctx.globalAlpha = active ? 1 - j * 0.22 : 0.8 - j * 0.22;
          ctx.beginPath();
          ctx.arc(icx, icy, r, -Math.PI * 0.65, Math.PI * 0.65);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } else if (shape === "plus") {
        ctx.beginPath();
        ctx.moveTo(icx, icy - 7); ctx.lineTo(icx, icy + 7);
        ctx.moveTo(icx - 7, icy); ctx.lineTo(icx + 7, icy);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(icx, icy - 7); ctx.lineTo(icx + 6, icy);
        ctx.lineTo(icx, icy + 7); ctx.lineTo(icx - 6, icy);
        ctx.closePath(); ctx.stroke();
      }
    });
  }, []);

  const canvasRef = useResizingCanvas(draw);

  const toCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { px: (e.clientX - r.left) * (c.width / r.width), py: (e.clientY - r.top) * (c.height / r.height), W: c.width, H: c.height };
  }, [canvasRef]);

  const hitTest = useCallback((px: number, py: number, W: number, H: number) => {
    const { cellSz, ox, oy, gH } = rgLayout(W, H);

    // Shape bar buttons
    const bW = 42, bH = 24, bGap = 7;
    const totalW = RG_SHAPES.length * bW + (RG_SHAPES.length - 1) * bGap;
    const bx0 = (W - totalW) / 2;
    const by  = H - RG_BAR_H + (RG_BAR_H - bH) / 2;
    for (let i = 0; i < RG_SHAPES.length; i++) {
      const bx = bx0 + i * (bW + bGap);
      if (px >= bx && px <= bx + bW && py >= by && py <= by + bH)
        return { type: "shape" as const, shape: RG_SHAPES[i] };
    }

    // Sparkle button
    if (Math.hypot(px - W / 2, py - (oy + gH / 2)) < 22) return { type: "btn" as const };

    // Grid cell
    const col = Math.floor((px - ox) / (cellSz + RG_GAP));
    const row = Math.floor((py - oy) / (cellSz + RG_GAP));
    if (col >= 0 && col < RG_COLS && row >= 0 && row < RG_ROWS) return { type: "cell" as const, row, col };

    return null;
  }, []);

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: "pointer", background: "#0a0a0a" }}
        onClick={e => {
          if (!canvasRef.current) return;
          const { px, py, W, H } = toCanvas(e);
          const hit = hitTest(px, py, W, H);
          if (!hit) return;
          if (hit.type === "shape") { shapeRef.current = hit.shape; return; }
          if (hit.type === "btn")   { triggerAt(Math.floor(RG_ROWS / 2), Math.floor(RG_COLS / 2)); return; }
          triggerAt(hit.row, hit.col);
        }}
        onMouseMove={e => {
          if (!canvasRef.current) return;
          const { px, py, W, H } = toCanvas(e);
          const hit = hitTest(px, py, W, H);
          btnHoverRef.current   = hit?.type === "btn";
          shapeHoverRef.current = hit?.type === "shape" ? hit.shape : null;
        }}
        onMouseLeave={() => { btnHoverRef.current = false; shapeHoverRef.current = null; }}
      />
    </div>
  );
}

// ─── 2. Hyperspace ───────────────────────────────────────────────────────────
const _hsSeed = (n: number) => ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
const HS_COLORS: [number, number, number][] = [
  [255, 65, 50], [255, 90, 55], [70, 215, 255], [255, 195, 55],
  [255, 70, 175], [255, 135, 50], [255, 255, 195], [255, 105, 80],
];
const HS_STARS = Array.from({ length: 650 }, (_, i) => ({
  angle:      _hsSeed(i) * Math.PI * 2,
  phase:      _hsSeed(i + 1000),
  color:      HS_COLORS[Math.floor(_hsSeed(i + 2000) * HS_COLORS.length)],
  size:       _hsSeed(i + 3000) * 2.4 + 0.4,
  twinkleSpd: _hsSeed(i + 4000) * 2 + 0.3,
  twinklePh:  _hsSeed(i + 5000) * Math.PI * 2,
  fieldX:     _hsSeed(i + 6000),
  fieldY:     _hsSeed(i + 7000),
}));

function HyperspaceFragment() {
  const warpRef    = useRef(0);
  const hoveredRef = useRef(false);

  const draw = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    warpRef.current += ((hoveredRef.current ? 1 : 0) - warpRef.current) * 0.045;
    const w    = warpRef.current;
    const cx   = W / 2, cy = H / 2;
    const diag = Math.sqrt(cx * cx + cy * cy);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    if (w > 0.02) {
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, diag * 0.8);
      bg.addColorStop(0, `rgba(55,4,4,${w * 0.5})`);
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }

    for (const { angle, phase, color: [r, g, b], size, twinkleSpd, twinklePh, fieldX, fieldY } of HS_STARS) {
      const rawDist = (t * 0.17 + phase) % 1;
      const pixDist = rawDist * diag * 1.15;
      const warpX   = cx + Math.cos(angle) * pixDist;
      const warpY   = cy + Math.sin(angle) * pixDist;
      // Slow autonomous drift — each star has a unique Lissajous path
      const driftAmt = 12 + size * 4;
      const fx = fieldX * W + Math.sin(t * twinkleSpd * 0.18 + twinklePh) * driftAmt;
      const fy = fieldY * H + Math.cos(t * twinkleSpd * 0.14 + twinklePh + 1.3) * driftAmt;

      if (w < 0.02) {
        // Starfield — moving colorful dots
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * twinkleSpd + twinklePh));
        ctx.fillStyle = `rgba(${r},${g},${b},${twinkle})`;
        ctx.beginPath(); ctx.arc(fx, fy, Math.max(0.5, size * 0.45), 0, Math.PI * 2); ctx.fill();

      } else if (w < 0.5) {
        // Transition: dots drift toward radial positions and fade out
        const bx    = fx + (warpX - fx) * w * 2;
        const by    = fy + (warpY - fy) * w * 2;
        const alpha = (1 - w * 2) * (0.4 + 0.6 * Math.abs(Math.sin(t * twinkleSpd + twinklePh)));
        if (alpha > 0) {
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.beginPath(); ctx.arc(bx, by, Math.max(0.3, size * 0.4), 0, Math.PI * 2); ctx.fill();
        }

      } else {
        // Warp — radial streaks from center
        const wf         = (w - 0.5) * 2;
        const streakFrac = (0.05 + 0.2 * Math.min(1, rawDist * 2)) * wf;
        const innerPx    = Math.max(0, rawDist - streakFrac) * diag * 1.15;
        const x0 = cx + Math.cos(angle) * innerPx;
        const y0 = cy + Math.sin(angle) * innerPx;
        const alpha = Math.pow(rawDist, 0.45) * wf * Math.min(1, size * 0.45);
        if (alpha > 0.01) {
          const lg = ctx.createLinearGradient(x0, y0, warpX, warpY);
          lg.addColorStop(0, `rgba(${r},${g},${b},0)`);
          lg.addColorStop(1, `rgba(${r},${g},${b},${Math.min(1, alpha)})`);
          ctx.strokeStyle = lg;
          ctx.lineWidth = Math.max(0.2, size * 0.45 * (0.3 + rawDist * 0.7));
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(warpX, warpY); ctx.stroke();
        }
      }
    }

    // Central convergence glow
    if (w > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20 + w * 40);
      cg.addColorStop(0,    `rgba(255,225,195,${w * 0.95})`);
      cg.addColorStop(0.35, `rgba(255,75,20,${w * 0.35})`);
      cg.addColorStop(1,    "rgba(0,0,0,0)");
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, cy, 20 + w * 40, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }, []);

  const canvasRef = useResizingCanvas(draw);

  return (
    <div
      style={{ flex: 1, position: "relative", overflow: "hidden", cursor: "crosshair" }}
      onMouseEnter={() => { hoveredRef.current = true; }}
      onMouseLeave={() => { hoveredRef.current = false; }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", background: "#000" }} />
      <p style={{ position: "absolute", bottom: 7, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "rgba(255,160,80,0.30)", letterSpacing: "0.14em", textTransform: "uppercase", pointerEvents: "none" }}>hover · engage warp</p>
    </div>
  );
}

// ─── 3. KO — Beat Maker ───────────────────────────────────────────────────────
const KO_ROWS    = 6;
const KO_STEPS   = 16;
const KO_BPM_MIN = 60;
const KO_BPM_MAX = 200;
const KO_PAD_COLOR = "#4ECDC4";

type KOTabId = "drums" | "bass" | "synth" | "strings" | "impact";
const KO_TABS_CONFIG: { id: KOTabId; label: string }[] = [
  { id: "drums",   label: "Drums"   },
  { id: "bass",    label: "Bass"    },
  { id: "synth",   label: "Synth"   },
  { id: "strings", label: "Strings" },
  { id: "impact",  label: "Impact"  },
];
const KO_BASS_FREQS   = [65.41,  73.42,  82.41,  98.00, 110.00, 123.47];
const KO_SYNTH_FREQS  = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
const KO_STRING_FREQS = [130.81, 146.83, 164.81, 196.00, 220.00, 261.63];

let _koAudio: AudioContext | null = null;
let _koMaster: GainNode | null = null;
let _koStreamDest: MediaStreamAudioDestinationNode | null = null;
function koCtx(): [AudioContext, GainNode] {
  if (!_koAudio) _koAudio = new AudioContext();
  if (_koAudio.state === "suspended") _koAudio.resume();
  if (!_koMaster) {
    _koMaster = _koAudio.createGain();
    _koMaster.gain.value = 0.8;
    _koMaster.connect(_koAudio.destination);
    _koStreamDest = _koAudio.createMediaStreamDestination();
    _koMaster.connect(_koStreamDest);
  }
  return [_koAudio, _koMaster];
}

function koKick() {
  const [a, out] = koCtx();
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = "sine"; osc.frequency.setValueAtTime(180, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, a.currentTime + 0.18);
  gain.gain.setValueAtTime(1.0, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.28);
  osc.connect(gain); gain.connect(out);
  osc.start(); osc.stop(a.currentTime + 0.3);
}
function koSnare() {
  const [a, out] = koCtx();
  const buf = a.createBuffer(1, a.sampleRate * 0.12, a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), gain = a.createGain();
  const filt = a.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 1800;
  gain.gain.setValueAtTime(0.45, a.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.14);
  src.buffer = buf; src.connect(filt); filt.connect(gain); gain.connect(out); src.start();
}
function koHat() {
  const [a, out] = koCtx();
  const buf = a.createBuffer(1, a.sampleRate * 0.06, a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), gain = a.createGain();
  const filt = a.createBiquadFilter(); filt.type = "highpass"; filt.frequency.value = 7000;
  gain.gain.setValueAtTime(0.28, a.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.07);
  src.buffer = buf; src.connect(filt); filt.connect(gain); gain.connect(out); src.start();
}
function koOpenHat() {
  const [a, out] = koCtx();
  const buf = a.createBuffer(1, a.sampleRate * 0.22, a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), gain = a.createGain();
  const filt = a.createBiquadFilter(); filt.type = "highpass"; filt.frequency.value = 6000;
  gain.gain.setValueAtTime(0.22, a.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.20);
  src.buffer = buf; src.connect(filt); filt.connect(gain); gain.connect(out); src.start();
}
function koClap() {
  const [a, out] = koCtx();
  const buf = a.createBuffer(1, a.sampleRate * 0.08, a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), gain = a.createGain();
  const filt = a.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 1200; filt.Q.value = 0.5;
  gain.gain.setValueAtTime(0.35, a.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.1);
  src.buffer = buf; src.connect(filt); filt.connect(gain); gain.connect(out); src.start();
}
function koTom() {
  const [a, out] = koCtx();
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = "sine"; osc.frequency.setValueAtTime(110, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(55, a.currentTime + 0.15);
  gain.gain.setValueAtTime(0.7, a.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.22);
  osc.connect(gain); gain.connect(out); osc.start(); osc.stop(a.currentTime + 0.25);
}
function koBassNote(freq: number) {
  const [a, out] = koCtx();
  const osc = a.createOscillator(), gain = a.createGain(), dist = a.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = (i * 2) / 256 - 1; curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x)); }
  dist.curve = curve; osc.type = "sine"; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0, a.currentTime); gain.gain.linearRampToValueAtTime(0.9, a.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.55);
  osc.connect(dist); dist.connect(gain); gain.connect(out); osc.start(); osc.stop(a.currentTime + 0.6);
}
function koSynthNote(freq: number) {
  const [a, out] = koCtx();
  const osc = a.createOscillator(), gain = a.createGain(), filt = a.createBiquadFilter();
  filt.type = "lowpass"; filt.Q.value = 8;
  filt.frequency.setValueAtTime(freq * 12, a.currentTime);
  filt.frequency.exponentialRampToValueAtTime(freq * 1.2, a.currentTime + 0.35);
  osc.type = "sawtooth"; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0, a.currentTime); gain.gain.linearRampToValueAtTime(0.35, a.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.4);
  osc.connect(filt); filt.connect(gain); gain.connect(out); osc.start(); osc.stop(a.currentTime + 0.45);
}
function koStringsNote(freq: number) {
  const [a, out] = koCtx();
  const gain = a.createGain(), filt = a.createBiquadFilter();
  filt.type = "lowpass"; filt.frequency.value = 1800; filt.Q.value = 0.5;
  gain.gain.setValueAtTime(0.0, a.currentTime); gain.gain.linearRampToValueAtTime(0.22, a.currentTime + 0.06);
  gain.gain.setValueAtTime(0.22, a.currentTime + 0.38); gain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.75);
  [-8, 0, 8].forEach(dt => { const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq; o.detune.value = dt; o.connect(filt); o.start(); o.stop(a.currentTime + 0.8); });
  filt.connect(gain); gain.connect(out);
}
function koImpactVar(row: number) {
  const [a, out] = koCtx();
  const freq = [90, 70, 55, 110, 80, 60][row] ?? 80;
  const osc = a.createOscillator(), oscGain = a.createGain();
  osc.type = "sine"; osc.frequency.setValueAtTime(freq, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, a.currentTime + 0.22);
  oscGain.gain.setValueAtTime(1.1, a.currentTime); oscGain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.35);
  osc.connect(oscGain); oscGain.connect(out); osc.start(); osc.stop(a.currentTime + 0.4);
  const buf = a.createBuffer(1, a.sampleRate * 0.09, a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), noiseGain = a.createGain();
  noiseGain.gain.setValueAtTime(0.6, a.currentTime); noiseGain.gain.exponentialRampToValueAtTime(0.01, a.currentTime + 0.09);
  src.buffer = buf; src.connect(noiseGain); noiseGain.connect(out); src.start();
}
function koFireNote(tab: KOTabId, row: number) {
  const drumFns = [koKick, koSnare, koHat, koOpenHat, koClap, koTom];
  if (tab === "drums")   { drumFns[row]?.(); return; }
  if (tab === "bass")    { koBassNote(KO_BASS_FREQS[row]); return; }
  if (tab === "synth")   { koSynthNote(KO_SYNTH_FREQS[row]); return; }
  if (tab === "strings") { koStringsNote(KO_STRING_FREQS[row]); return; }
  if (tab === "impact")  { koImpactVar(row); }
}

const koCtrlBtn: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 6, border: "1.5px solid rgba(255,255,255,0.16)",
  background: "transparent", color: "#fff", cursor: "pointer", fontSize: 14, padding: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const koOutlineBtn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.16)",
  background: "transparent", color: "rgba(255,255,255,0.85)", cursor: "pointer",
  fontSize: 11, fontWeight: 500,
};

function KOFragment() {
  const [grid, setGrid] = useState<boolean[][][]>(() =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: KO_ROWS }, () => new Array(KO_STEPS).fill(false))
    )
  );
  const [activeTab, setActiveTab] = useState(0);
  const [playing, setPlaying]     = useState(false);
  const [bpm, setBpm]             = useState(120);
  const [step, setStep]           = useState(-1);
  const [vol, setVol]             = useState(0.8);
  const [loops, setLoops]         = useState(2);
  const [recording, setRecording] = useState(false);
  const [loopMode, setLoopMode]   = useState(false);

  const playingRef   = useRef(false);
  const bpmRef       = useRef(120);
  const stepRef      = useRef(-1);
  const gridRef      = useRef(grid);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopCountRef = useRef(0);
  const loopsRef     = useRef(2);
  const loopModeRef  = useRef(false);

  useEffect(() => { bpmRef.current     = bpm;      }, [bpm]);
  useEffect(() => { gridRef.current    = grid;     }, [grid]);
  useEffect(() => { playingRef.current = playing;  }, [playing]);
  useEffect(() => { loopsRef.current   = loops;    }, [loops]);
  useEffect(() => { loopModeRef.current = loopMode; }, [loopMode]);
  useEffect(() => { if (_koMaster) _koMaster.gain.value = vol; }, [vol]);

  const tick = useCallback(() => {
    if (!playingRef.current) return;
    const nextStep = (stepRef.current + 1) % KO_STEPS;
    if (nextStep === 0 && stepRef.current !== -1) {
      loopCountRef.current += 1;
      if (!loopModeRef.current && loopsRef.current > 0 && loopCountRef.current >= loopsRef.current) {
        playingRef.current = false; setPlaying(false); stepRef.current = -1; setStep(-1); return;
      }
    }
    stepRef.current = nextStep; setStep(nextStep);
    const g = gridRef.current;
    try { KO_TABS_CONFIG.forEach(({ id }, ti) => { g[ti].forEach((row, ri) => { if (row[nextStep]) koFireNote(id, ri); }); }); } catch (_) {}
    timerRef.current = setTimeout(tick, (60 / bpmRef.current / 4) * 1000);
  }, []);

  const startSeq = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    loopCountRef.current = 0; playingRef.current = true; setPlaying(true);
    timerRef.current = setTimeout(tick, (60 / bpmRef.current / 4) * 1000);
  }, [tick]);

  const stopSeq = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    playingRef.current = false; setPlaying(false); stepRef.current = -1; setStep(-1);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const toggleCell = useCallback((ti: number, ri: number, si: number) => {
    setGrid(g => g.map((t, tIdx) => tIdx !== ti ? t :
      t.map((r, rIdx) => rIdx !== ri ? r : r.map((v, sIdx) => sIdx === si ? !v : v))
    ));
  }, []);

  const clearTab = useCallback(() => {
    setGrid(g => g.map((t, ti) => ti !== activeTab ? t :
      Array.from({ length: KO_ROWS }, () => new Array(KO_STEPS).fill(false))
    ));
  }, [activeTab]);

  const fillDemo = useCallback(() => {
    setGrid(() => Array.from({ length: 5 }, (_, ti) =>
      Array.from({ length: KO_ROWS }, (_, ri) =>
        Array.from({ length: KO_STEPS }, (_, si) => {
          if (ti === 0) {
            if (ri === 0) return si % 4 === 0;
            if (ri === 1) return si === 4 || si === 12;
            if (ri === 2) return si % 2 === 0;
            return Math.random() < 0.12;
          }
          return Math.random() < 0.10;
        })
      )
    ));
  }, []);

  const downloadPattern = useCallback(() => {
    if (playing || recording) return;
    try { koCtx(); } catch (_) { return; }
    if (!_koStreamDest) return;
    const chunks: Blob[] = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(_koStreamDest.stream, { mimeType });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ko-${loops}loop.webm`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setRecording(false);
    };
    setRecording(true);
    recorder.start(100);
    startSeq();
    const barMs = (60 / bpmRef.current / 4) * KO_STEPS * 1000;
    setTimeout(() => { stopSeq(); recorder.stop(); }, barMs * loops + 200);
  }, [playing, recording, loops, startSeq, stopSeq]);

  const currentGrid = grid[activeTab];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#111", overflow: "hidden", userSelect: "none" }}>
      {/* Top bar: tabs + BPM */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4, flex: 1 }}>
          {KO_TABS_CONFIG.map(({ id, label }, i) => {
            const active = i === activeTab;
            return (
              <button key={id} onClick={() => setActiveTab(i)} style={{
                padding: "4px 9px", borderRadius: 7, cursor: "pointer", fontSize: 11,
                fontWeight: active ? 700 : 500, whiteSpace: "nowrap",
                background: active ? KO_PAD_COLOR : "transparent",
                color: active ? "#000" : "rgba(255,255,255,0.6)",
                border: `1.5px solid ${active ? KO_PAD_COLOR : "rgba(255,255,255,0.16)"}`,
                transition: "all 0.12s",
              }}>{label}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button onClick={() => setBpm(b => Math.max(KO_BPM_MIN, b - 5))} style={koCtrlBtn}>−</button>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", minWidth: 26, textAlign: "center", fontFamily: "'SF Mono','Courier New',monospace" }}>{bpm}</span>
          <button onClick={() => setBpm(b => Math.min(KO_BPM_MAX, b + 5))} style={koCtrlBtn}>+</button>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginLeft: 1 }}>BPM</span>
        </div>
      </div>

      {/* Pad grid */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "2px 10px", gap: 3, overflow: "hidden" }}>
        {currentGrid.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: 3, flex: 1, minHeight: 0 }}>
            {row.map((on, si) => {
              const isActive = si === step;
              const isBar    = si % 4 === 0;
              return (
                <div key={si} onClick={() => toggleCell(activeTab, ri, si)} style={{
                  flex: 1, borderRadius: 4, cursor: "pointer",
                  background: on
                    ? (isActive ? KO_PAD_COLOR : KO_PAD_COLOR + "88")
                    : (isActive ? "rgba(255,255,255,0.12)" : isBar ? "#222" : "#1a1a1a"),
                  border: `1px solid ${on ? "transparent" : isBar ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)"}`,
                  boxShadow: on && isActive ? `0 0 7px ${KO_PAD_COLOR}` : "none",
                  transition: "background 0.07s",
                }} />
              );
            })}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 0 0", flexShrink: 0 }} />

      {/* Bottom bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", flexShrink: 0 }}>
        <button onClick={() => playing ? stopSeq() : startSeq()} style={{ ...koOutlineBtn, minWidth: 58 }}>
          {playing ? "■ Stop" : "▶ Play"}
        </button>
        <button onClick={clearTab} style={koOutlineBtn}>Clear</button>
        <button onClick={fillDemo} style={koOutlineBtn}>Demo</button>
        <button
          onClick={() => setLoopMode(l => !l)}
          style={{ ...koOutlineBtn, background: loopMode ? KO_PAD_COLOR : "transparent", color: loopMode ? "#000" : "rgba(255,255,255,0.85)", border: `1.5px solid ${loopMode ? KO_PAD_COLOR : "rgba(255,255,255,0.16)"}`, fontWeight: loopMode ? 700 : 500 }}
        >↺ Loop</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Vol:</span>
        <input type="range" min={0} max={1} step={0.01} value={vol}
          onChange={e => setVol(Number(e.target.value))}
          style={{ width: 64, accentColor: KO_PAD_COLOR, cursor: "pointer" }} />
        <button onClick={() => setLoops(l => Math.max(1, l - 1))} style={koCtrlBtn}>−</button>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", minWidth: 44, textAlign: "center" }}>{loops} loop{loops !== 1 ? "s" : ""}</span>
        <button onClick={() => setLoops(l => Math.min(8, l + 1))} style={koCtrlBtn}>+</button>
        <button
          onClick={downloadPattern}
          disabled={playing || recording}
          style={{ ...koOutlineBtn, background: recording ? "#e74c3c" : KO_PAD_COLOR, color: "#000", border: `1px solid ${recording ? "#e74c3c" : KO_PAD_COLOR}`, fontWeight: 700, opacity: playing ? 0.4 : 1 }}>
          {recording ? "● Rec…" : "↓ Download"}
        </button>
      </div>
    </div>
  );
}

// ─── 4. Boson ─────────────────────────────────────────────────────────────────
type BosonParticle = {
  theta: number; phi: number;
  // shell: 0=innermost..3=outermost, 4=escaped
  shell: number;
  baseR: number;       // rest radius for this shell
  shellPhase: number;  // per-shell breath phase offset
  hue: number;
  sat: number;
  size: number;
  phase: number;
};

// Shell config: [baseRadius, count, redBias, breathAmp]
const BOSON_SHELLS = [
  { baseR: 0.28, count: 300,  redBias: 0.30, breathAmp: 0.08 },  // inner core — mostly blue
  { baseR: 0.52, count: 600,  redBias: 0.40, breathAmp: 0.12 },  // mid-inner
  { baseR: 0.74, count: 900,  redBias: 0.52, breathAmp: 0.16 },  // mid-outer
  { baseR: 0.96, count: 1600, redBias: 0.65, breathAmp: 0.20 },  // outer skin — mostly red
  { baseR: 1.30, count: 280,  redBias: 0.55, breathAmp: 0.05 },  // escaped
];

function initBosonParticles(): BosonParticle[] {
  const golden = Math.PI * (1 + Math.sqrt(5));
  const out: BosonParticle[] = [];
  let idx = 0;
  BOSON_SHELLS.forEach(({ baseR, count, redBias, breathAmp }, shell) => {
    for (let i = 0; i < count; i++, idx++) {
      // Fibonacci sphere per shell
      const theta = Math.acos(1 - 2 * (i + 0.5) / count);
      const phi   = (golden * i) % (2 * Math.PI);
      const isRed = Math.random() < redBias;
      const hue   = isRed ? 345 + Math.random() * 25 : 215 + Math.random() * 35;
      // Escaped particles scatter randomly
      const scatterTheta = shell === 4 ? Math.acos(1 - 2 * Math.random()) : theta;
      const scatterPhi   = shell === 4 ? Math.random() * Math.PI * 2       : phi;
      out.push({
        theta: scatterTheta,
        phi:   scatterPhi,
        shell,
        baseR: baseR + (Math.random() - 0.5) * breathAmp * 0.6,
        shellPhase: Math.random() * Math.PI * 2,
        hue,
        sat: 70 + Math.random() * 25,
        size: shell === 4 ? 0.3 + Math.random() * 0.7 : 0.4 + Math.random() * (0.8 + shell * 0.15),
        phase: Math.random() * Math.PI * 2,
      });
    }
  });
  return out;
}

function BosonFragment() {
  const mouseRef     = useRef({ x: 0.5, y: 0.5 });
  const particlesRef = useRef<BosonParticle[] | null>(null);

  const draw = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    if (!particlesRef.current) particlesRef.current = initBosonParticles();
    const particles = particlesRef.current;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const cx    = W / 2;
    const cy    = H / 2;
    const scale = Math.min(W, H) * 0.37;

    const mx = (mouseRef.current.x - 0.5) * 0.55;
    const my = (mouseRef.current.y - 0.5) * 0.40;

    const rotY = t * 0.10 + mx;
    const rotX = t * 0.06 + 0.25 + my;

    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    // Blob deformation shape — applied per-shell with varying amplitude
    const blobShape = (th: number, ph: number, amp: number) =>
      amp * (
        Math.sin(3 * th + t * 0.18) * 0.55 +
        Math.sin(5 * ph - t * 0.13) * 0.35 +
        Math.sin(7 * th + 2 * ph + t * 0.09) * 0.20 +
        Math.cos(4 * ph - th + t * 0.21) * 0.15
      );

    // Global breath — whole cloud inhales/exhales
    const globalBreath = 1 + 0.06 * Math.sin(t * 0.55);

    const breathAmps = BOSON_SHELLS.map(s => s.breathAmp);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const amp  = breathAmps[p.shell];
      // Per-shell independent breath phase
      const breath = 1 + amp * Math.sin(t * 0.7 + p.shellPhase);
      const r = p.baseR * breath * globalBreath + blobShape(p.theta, p.phi, amp * 0.6);

      const sinT = Math.sin(p.theta);
      const x0   =  r * sinT * Math.cos(p.phi);
      const y0   =  r * Math.cos(p.theta);
      const z0   =  r * sinT * Math.sin(p.phi);

      // Rotate Y
      const x1 =  x0 * cosY + z0 * sinY;
      const z1 = -x0 * sinY + z0 * cosY;

      // Rotate X
      const y2 = y0 * cosX - z1 * sinX;
      const z2 = y0 * sinX + z1 * cosX;

      const persp = 1 + z2 * 0.20;
      const px = cx + x1 * scale * persp;
      const py = cy - y2 * scale * persp;

      const depth  = (z2 + 1.6) / 3.2;
      // Inner shells dim more — outer shell stays bright
      const shellBright = 0.35 + (p.shell / 4) * 0.65;
      const alpha = Math.max(0,
        shellBright * (0.25 + depth * 0.75) *
        (0.7 + 0.3 * Math.sin(t * 1.6 + p.phase))
      );
      const lum = Math.round(30 + depth * 55 + (p.shell / 4) * 10);
      const s   = p.size * (0.5 + depth * 0.7) * persp;

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = `hsl(${p.hue},${p.sat}%,${lum}%)`;
      ctx.beginPath();
      ctx.arc(px, py, s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    ctx.font      = "bold 9px 'SF Mono','Courier New',monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(180,60,60,0.35)";
    ctx.fillText(`ψ ${t.toFixed(2)}`, W - 8, H - 8);
    ctx.textAlign = "left";
  }, []);

  const canvasRef = useResizingCanvas(draw);

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair", background: "#000" }}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          mouseRef.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        }}
        onMouseLeave={() => { mouseRef.current = { x: 0.5, y: 0.5 }; }}
      />
      <div style={{ position: "absolute", bottom: 7, right: 10, fontSize: 8, color: "rgba(180,60,60,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", pointerEvents: "none" }}>
        neural · particle · field
      </div>
    </div>
  );
}

// ─── 5. Vector ────────────────────────────────────────────────────────────────
function VectorFragment() {
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const speedRef = useRef(1);

  const draw = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    const speed = speedRef.current;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const vanishX = W / 2 + (mouseRef.current.x - 0.5) * 50;
    const vanishY = H / 2 + (mouseRef.current.y - 0.5) * 35;

    // Stars with warp stretch at high speed
    const seed = (n: number) => ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 140; i++) {
      const sx = seed(i) * W, sy = seed(i + 500) * H;
      const blink = 0.15 + 0.4 * Math.abs(Math.sin(t * (0.4 + seed(i + 200)) + seed(i + 300) * 6));
      const streak = speed > 1.5 ? (speed - 1.5) * 8 : 0;
      ctx.fillStyle = `rgba(220,230,255,${blink})`;
      if (streak > 0.5) {
        const dx = sx - vanishX, dy = sy - vanishY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / len, ny = dy / len;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + nx * streak, sy + ny * streak);
        ctx.strokeStyle = `rgba(220,230,255,${blink * 0.8})`;
        ctx.lineWidth = seed(i + 600) * 1.2 + 0.3;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, seed(i + 400) * 1.3 + 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const offset = (t * speed * 60) % 75;

    // Grid lines — horizontal
    ctx.lineWidth = 0.7;
    for (let i = -10; i <= 10; i++) {
      const y = H / 2 + i * 22 + (offset * Math.sign(i || 1)) % 22;
      if (Math.abs(y - H / 2) > H * 0.56) continue;
      const a = Math.max(0, 0.55 - Math.abs(i) * 0.045);
      ctx.strokeStyle = `rgba(200,145,5,${a})`;
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(vanishX, vanishY);
      ctx.moveTo(W, y); ctx.lineTo(vanishX, vanishY);
      ctx.stroke();
    }

    // Grid lines — vertical
    for (let i = -9; i <= 9; i++) {
      const x = W / 2 + i * 28;
      ctx.strokeStyle = "rgba(200,145,5,0.38)";
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(vanishX, vanishY);
      ctx.moveTo(x, H); ctx.lineTo(vanishX, vanishY);
      ctx.stroke();
    }

    // Red accent lines
    ctx.lineWidth = 1.6;
    [-1, 1].forEach(side => {
      const xOff = side * (38 + (t * speed * 35) % 95);
      const xl = vanishX + xOff;
      if (Math.abs(xOff) > W * 0.6) return;
      ctx.strokeStyle = `rgba(220,38,38,${0.7 - Math.abs(xOff) / (W * 0.8)})`;
      ctx.beginPath();
      ctx.moveTo(xl, 0); ctx.lineTo(vanishX, vanishY);
      ctx.moveTo(xl, H); ctx.lineTo(vanishX, vanishY);
      ctx.stroke();
    });

    // Wormhole ring
    const ringR = 14 + 3 * Math.sin(t * 2.5);
    const ringGlow = ctx.createRadialGradient(vanishX, vanishY, 0, vanishX, vanishY, ringR * 2.5);
    ringGlow.addColorStop(0, "rgba(245,158,11,0.9)");
    ringGlow.addColorStop(0.4, "rgba(245,100,11,0.4)");
    ringGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ringGlow;
    ctx.beginPath();
    ctx.arc(vanishX, vanishY, ringR * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.2;
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(vanishX, vanishY, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Timer
    ctx.font = "bold 11px 'SF Mono', 'Courier New', monospace";
    ctx.textAlign = "center";
    const bx = vanishX, by = vanishY + H * 0.2;
    ctx.fillStyle = "rgba(220,38,38,0.9)";
    ctx.strokeStyle = "rgba(220,38,38,0.5)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(bx - 32, by - 12, 64, 18);
    ctx.fillText(t.toFixed(3), bx, by + 2);
    ctx.textAlign = "left";
  }, []);

  const canvasRef = useResizingCanvas(draw);

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
        onClick={() => { speedRef.current = speedRef.current > 3.5 ? 0.6 : speedRef.current + 0.9; }}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          mouseRef.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        }}
      />
      <div style={{ position: "absolute", bottom: 7, right: 10, fontSize: 8, color: "rgba(200,145,5,0.45)", letterSpacing: "0.1em", textTransform: "uppercase", pointerEvents: "none" }}>
        click · {'>>'} warp
      </div>
    </div>
  );
}

// ─── 6. Shapes Grid ──────────────────────────────────────────────────────────
const SG_COLORS = [
  "#FF6B35", "#FF4757", "#FD79A8", "#FF9F43",
  "#A29BFE", "#6C5CE7", "#74B9FF", "#48DBFB",
  "#2ECC71", "#00CEC9", "#55EFC4", "#1DD1A1",
  "#FDCB6E", "#FFEAA7", "#DFE6E9", "#E17055",
];

type SGShape = "sparkle" | "circle" | "pill" | "burst" | "star";
const SG_SHAPES: SGShape[] = ["sparkle", "circle", "pill", "burst", "star"];

function sgSeed(n: number) {
  return ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
}

function drawSGShape(
  ctx: CanvasRenderingContext2D,
  type: SGShape,
  cx: number, cy: number,
  size: number, angle: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  if (type === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "sparkle") {
    const outer = size, inner = size * 0.18;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a1 = angle + i * Math.PI / 2;
      const a2 = angle + (i + 0.5) * Math.PI / 2;
      const px = cx + Math.cos(a1) * outer, py = cy + Math.sin(a1) * outer;
      const qx = cx + Math.cos(a2) * inner, qy = cy + Math.sin(a2) * inner;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      ctx.lineTo(qx, qy);
    }
    ctx.closePath();
    ctx.fill();
  } else if (type === "pill") {
    const long = size * 1.6, short = size * 0.55, r = short / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.roundRect(-long / 2, -short / 2, long, short, r);
    ctx.fill();
    ctx.restore();
  } else if (type === "burst") {
    ctx.lineWidth = Math.max(1.5, size * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = angle + (i * Math.PI / 6);
      ctx.moveTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
      ctx.lineTo(cx + Math.cos(a + Math.PI) * size, cy + Math.sin(a + Math.PI) * size);
    }
    ctx.stroke();
  } else if (type === "star") {
    const outer = size, inner = size * 0.42;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r2 = i % 2 === 0 ? outer : inner;
      const a = angle + (i * Math.PI / 4);
      const px = cx + Math.cos(a) * r2, py = cy + Math.sin(a) * r2;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function ShapesGridFragment() {
  const mouseRef = useRef({ x: -1, y: -1 });

  const draw = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    ctx.fillStyle = "#08080f";
    ctx.fillRect(0, 0, W, H);

    const cell = 22;
    const cols = Math.ceil(W / cell);
    const rows = Math.ceil(H / cell);
    const offX = (W - cols * cell) / 2 + cell / 2;
    const offY = (H - rows * cell) / 2 + cell / 2;
    const influence = Math.min(W, H) * 0.45;
    const { x: mx, y: my } = mouseRef.current;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        const cx = offX + col * cell;
        const cy = offY + row * cell;

        const color = SG_COLORS[Math.floor(sgSeed(idx * 7 + 13) * SG_COLORS.length)];
        const shapeType = SG_SHAPES[Math.floor(sgSeed(idx * 3 + 5) * SG_SHAPES.length)];
        const baseAngle = sgSeed(idx * 11 + 17) * Math.PI * 2;

        const dist = mx >= 0 ? Math.hypot(mx - cx, my - cy) : Infinity;
        const raw = Math.max(0, 1 - dist / influence);
        const eased = raw * raw * (3 - 2 * raw);

        const breath = Math.sin(t * 1.1 + idx * 0.41) * 0.06;

        if (eased < 0.04) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.55 + breath;
          ctx.beginPath();
          ctx.arc(cx, cy, 1.6 * (1 + breath * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          const size = 1.6 + (cell * 0.46 - 1.6) * eased;
          const rotRate = shapeType === "burst" ? 0.25 : shapeType === "sparkle" ? 0.15 : 0.08;
          const angle = baseAngle + t * rotRate;
          ctx.globalAlpha = 0.55 + eased * 0.45;
          drawSGShape(ctx, shapeType, cx, cy, size, angle, color);
          ctx.globalAlpha = 1;
        }
      }
    }
  }, []);

  const canvasRef = useResizingCanvas(draw);

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair", background: "#08080f" }}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          const sx = e.currentTarget.width / r.width;
          const sy = e.currentTarget.height / r.height;
          mouseRef.current = { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
        }}
        onMouseLeave={() => { mouseRef.current = { x: -1, y: -1 }; }}
      />
    </div>
  );
}

// ─── Mode config ──────────────────────────────────────────────────────────────
const MODES: { mode: CosmicMode; icon: React.ReactNode; label: string; gradient: string }[] = [
  { mode: "haptic",   icon: <Sparkles size={12} />,     label: "Ripple",   gradient: "linear-gradient(135deg,#4f46e5,#818cf8)" },
  { mode: "hyperspace", icon: <Zap size={12} />,           label: "Hyperspace", gradient: "linear-gradient(135deg,#dc2626,#f97316,#facc15)" },
  { mode: "ko",       icon: <Drum size={12} />,          label: "KO",       gradient: "linear-gradient(135deg,#FF4757,#FFA502,#2ED573)" },
  { mode: "boson",    icon: <Atom size={12} />,          label: "Boson",    gradient: "linear-gradient(135deg,#ef4444,#f97316)" },
  { mode: "vector",   icon: <Crosshair size={12} />,     label: "Vector",   gradient: "linear-gradient(135deg,#b45309,#dc2626)" },
  { mode: "artifact", icon: <Box size={12} />,           label: "Shapes",   gradient: "linear-gradient(135deg,#FF6B35,#A29BFE,#2ECC71)" },
];

// ─── CosmicNode ───────────────────────────────────────────────────────────────
export function CosmicNode({ data, selected }: NodeProps<CosmicNodeType>) {
  const { mindNode } = data;
  const cosmicData = mindNode.data as CosmicData;
  const { updateNode, deleteNode } = useStore();
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();
  const [fullMode, setFullMode] = useState(false);

  const activeMode = MODES.find(m => m.mode === cosmicData.mode) ?? MODES[0];

  const toggleFullMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullMode(v => !v);
    setTimeout(() => updateNodeInternals(mindNode.id), 0);
  }, [mindNode.id, updateNodeInternals]);

  const setMode = useCallback((mode: CosmicMode) => {
    updateNode(mindNode.id, { data: { ...cosmicData, mode } });
  }, [cosmicData, mindNode.id, updateNode]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: fullMode ? "auto" : mindNode.height, display: "flex", flexDirection: "column" }}
      onDoubleClick={e => e.stopPropagation()}
    >
      <NodeResizer
        minWidth={300} minHeight={250} isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Animated gradient accent bar */}
      <div style={{ height: 3, background: activeMode.gradient, flexShrink: 0, transition: "background 0.4s ease" }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0, gap: 7 }}>
        <div style={{ width: 22, height: 22, borderRadius: 7, background: activeMode.gradient, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>
          <Sparkles size={12} color="#fff" />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ms-text)", letterSpacing: "-0.01em" }}>Cosmic</span>
        <span style={{ fontSize: 10, color: "var(--ms-text-muted)", flex: 1 }}>· {activeMode.label}</span>
        {cmdDown && <span style={{ fontSize: 9, color: "var(--ms-accent)", fontWeight: 600, letterSpacing: "0.05em" }}>RESIZE</span>}
        <button onClick={toggleFullMode} title={fullMode ? "Collapse" : "Expand"} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}>
          {fullMode ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button onClick={e => { e.stopPropagation(); deleteNode(mindNode.id); }} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}>
          <Trash2 size={11} />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="nodrag nopan" style={{ display: "flex", gap: 3, padding: "5px 9px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.045)", background: "rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}>
        {MODES.map(({ mode, icon, label, gradient }) => {
          const active = cosmicData.mode === mode;
          return (
            <motion.button
              key={mode}
              onClick={() => setMode(mode)}
              title={label}
              whileTap={{ scale: 0.9 }}
              style={{
                flex: 1, padding: "5px 2px", border: "none", borderRadius: 8, cursor: "pointer",
                position: "relative", overflow: "hidden",
                background: active ? "transparent" : "transparent",
                color: active ? "#fff" : "var(--ms-text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: active ? "inset -2px -2px 5px rgba(255,255,255,0.04), inset 2px 2px 5px rgba(0,0,0,0.5)" : "none",
                transition: "color 0.15s, box-shadow 0.15s",
              }}>
              {active && <span style={{ position: "absolute", inset: 0, background: gradient, opacity: 0.88, borderRadius: 8 }} />}
              <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>{icon}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Fragment */}
      <div className="nodrag nopan" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: fullMode ? 290 : undefined }}>
        {cosmicData.mode === "haptic"   && <RippleGridFragment />}
        {cosmicData.mode === "hyperspace" && <HyperspaceFragment />}
        {cosmicData.mode === "ko"       && <KOFragment />}
        {cosmicData.mode === "boson"    && <BosonFragment />}
        {cosmicData.mode === "vector"   && <VectorFragment />}
        {cosmicData.mode === "artifact" && <ShapesGridFragment />}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default CosmicNode;
