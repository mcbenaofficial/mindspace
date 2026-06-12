import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Lock, Unlock, Group, Ungroup,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalSpaceBetween, AlignVerticalSpaceBetween,
} from "lucide-react";
import { MindSpaceLogo } from "../MindSpaceLogo";
import {
  ReactFlow,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  Node,
  Edge,
  Connection,
  OnNodeDrag,
  OnNodesDelete,
  OnEdgesDelete,
  OnConnect,
  NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { MindNode, NodeType } from "../../types";
import { NodePicker } from "./NodePicker";
import { nodeTypes, getDefaultSize, getDefaultData } from "../nodes";
import { DeletableEdge } from "../edges/DeletableEdge";
import { sounds } from "../../lib/sound";

// ─── Background canvas constants ─────────────────────────────────────────────

const NODE_R = 4.5;
const GRID_DOT_R = 1.4;
// How far the dot color is blended toward the text color: 0 = theme's
// near-invisible dot, 1 = full text color. Keeps the grid legible on every
// theme without per-theme color entries.
const GRID_DOT_MIX = 0.35;
const FLOAT_AMP = 2.5;
const PARTICLE_COUNT = 3;
const PARTICLE_SPEED = 0.12;
const PARTICLE_R = 1.8;

// Parse any CSS color string to [r, g, b] (handles #rgb, #rrggbb, rgb(), rgba())
function parseColor(color: string): [number, number, number] {
  const s = color.trim();
  if (s.startsWith("#")) {
    if (s.length === 4) return [parseInt(s[1]+s[1],16), parseInt(s[2]+s[2],16), parseInt(s[3]+s[3],16)];
    return [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  }
  const m = s.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [200, 255, 32];
}

interface FloatParams { px: number; py: number; fx: number; fy: number; ax: number; ay: number; }

function floatOf(id: string): FloatParams {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  const r = (n: number) => (Math.abs((h * (n * 2654435761)) | 0) % 10000) / 10000;
  return {
    px: r(1) * Math.PI * 2, py: r(2) * Math.PI * 2,
    fx: 0.08 + r(3) * 0.18, fy: 0.08 + r(4) * 0.18,
    ax: 1.2 + r(5) * FLOAT_AMP, ay: 1.2 + r(6) * FLOAT_AMP,
  };
}


// ─── Background canvas (behind ReactFlow) ────────────────────────────────────

interface BackgroundFx { enabled: boolean; style: "hover" | "proximity" | "ripple"; intensity: number; ambient: boolean; }

type GridColorPreset = "subtle" | "text" | "accent";

function BackgroundCanvas({ nodes, edges, liveMode, nodeColor, gridSize, gridOpacity, gridColor, fx }: { nodes: MindNode[]; edges: { id: string; source: string; target: string }[]; liveMode: boolean; nodeColor: string; gridSize: number; gridOpacity: number; gridColor: GridColorPreset; fx: BackgroundFx }) {
  const rfInstance = useReactFlow();
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const containerEl = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const startTime = useRef(performance.now());
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const liveModeRef = useRef(liveMode);
  const nodeColorRef = useRef(nodeColor);
  const gridSizeRef = useRef(gridSize);
  const gridOpacityRef = useRef(gridOpacity);
  const gridColorRef = useRef(gridColor);
  const fxRef = useRef(fx);
  const cursorRef = useRef({ x: -1e6, y: -1e6 });
  const floatCache = useRef<Map<string, FloatParams>>(new Map());

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { liveModeRef.current = liveMode; }, [liveMode]);
  useEffect(() => { gridSizeRef.current = gridSize; }, [gridSize]);
  useEffect(() => { gridOpacityRef.current = gridOpacity; }, [gridOpacity]);
  useEffect(() => { gridColorRef.current = gridColor; }, [gridColor]);
  useEffect(() => { nodeColorRef.current = nodeColor; }, [nodeColor]);
  useEffect(() => { fxRef.current = fx; }, [fx]);

  // Cursor tracking for the ambient/grid reaction. The canvas itself is
  // pointer-events: none, so listen at the window level in client coords.
  useEffect(() => {
    const move = (e: PointerEvent) => { cursorRef.current = { x: e.clientX, y: e.clientY }; };
    const leave = () => { cursorRef.current = { x: -1e6, y: -1e6 }; };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("mouseleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("mouseleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasEl.current;
    const container = containerEl.current;
    if (!canvas || !container) { rafRef.current = requestAnimationFrame(draw); return; }

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(draw); return; }

    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
    }

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { x: vx, y: vy, zoom } = rfInstance.getViewport();
    const t = (performance.now() - startTime.current) / 1000;
    const ns = nodesRef.current;
    const es = edgesRef.current;

    // Cursor in canvas-local coords + effect parameters for this frame.
    const fxNow = fxRef.current;
    const cRect = container.getBoundingClientRect();
    const mx = cursorRef.current.x - cRect.left;
    const my = cursorRef.current.y - cRect.top;
    const fxK = Math.max(0, Math.min(1, fxNow.intensity / 100));
    const fxR = 140 + 240 * fxK;
    // Ambient layer reacts for the proximity-based styles; "hover" is cards-only.
    const fxAmbientOn = fxNow.enabled && fxNow.ambient && fxNow.style !== "hover" && fxK > 0;
    const fxRipple = fxAmbientOn && fxNow.style === "ripple";
    // smoothstep falloff, 1 at the cursor → 0 at the radius edge
    const falloff = (px: number, py: number) => {
      const d = Math.hypot(px - mx, py - my);
      if (d >= fxR) return 0;
      const f = 1 - d / fxR;
      return f * f * (3 - 2 * f);
    };

    // ── Dot grid ──────────────────────────────────────────────────────────────
    // Spacing follows the Grid Size setting (same value snapping uses); color
    // comes from the active theme via the Grid Color preset, faded by the
    // Grid Opacity setting (0 hides the grid entirely).
    const rootStyle = getComputedStyle(document.documentElement);
    const textCol = rootStyle.getPropertyValue("--ms-text").trim() || "#e8eaf2";
    const [tr, tg, tb] = parseColor(textCol);
    let gr: number, gg: number, gb: number;
    if (gridColorRef.current === "text") {
      [gr, gg, gb] = [tr, tg, tb];
    } else if (gridColorRef.current === "accent") {
      [gr, gg, gb] = parseColor(rootStyle.getPropertyValue("--ms-accent").trim() || "#4ecfff");
    } else {
      const baseDot = rootStyle.getPropertyValue("--ms-dot").trim() || "#0a0c1e";
      const [dr, dg, db_] = parseColor(baseDot);
      const mix = (a: number, b: number) => Math.round(a + (b - a) * GRID_DOT_MIX);
      [gr, gg, gb] = [mix(dr, tr), mix(dg, tg), mix(db_, tb)];
    }
    const baseGridFill = `rgb(${gr}, ${gg}, ${gb})`;
    const gridAlpha = Math.max(0, Math.min(1, gridOpacityRef.current));
    const gapS = Math.max(gridSizeRef.current, 8) * zoom;
    if (gapS > 4 && gridAlpha > 0.01) {
      ctx.globalAlpha = gridAlpha;
      ctx.fillStyle = baseGridFill;
      const offX = ((vx % gapS) + gapS) % gapS;
      const offY = ((vy % gapS) + gapS) % gapS;
      for (let gx = offX; gx < W; gx += gapS) {
        for (let gy = offY; gy < H; gy += gapS) {
          let dotR = GRID_DOT_R;
          // Ripple style: grid dots near the cursor swell and brighten
          // (brighten = blend the preset color further toward the text color).
          if (fxRipple) {
            const e = falloff(gx, gy);
            if (e > 0.01) {
              dotR = GRID_DOT_R * (1 + 1.6 * fxK * e);
              const m2 = 0.85 * fxK * e;
              const mix2 = (a: number, b: number) => Math.round(a + (b - a) * m2);
              ctx.fillStyle = `rgb(${mix2(gr, tr)}, ${mix2(gg, tg)}, ${mix2(gb, tb)})`;
            } else {
              ctx.fillStyle = baseGridFill;
            }
          }
          ctx.beginPath();
          ctx.arc(gx, gy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Plain mode: only the grid, no node dots or edge lines
    if (!liveModeRef.current || ns.length === 0) { rafRef.current = requestAnimationFrame(draw); return; }

    // Resolve node color — custom override or theme accent
    const rawColor = nodeColorRef.current ||
      getComputedStyle(document.documentElement).getPropertyValue("--ms-accent").trim() ||
      "#c8ff20";
    const [cr, cg, cb] = parseColor(rawColor);
    const dotColor2 = `#${cr.toString(16).padStart(2,"0")}${cg.toString(16).padStart(2,"0")}${cb.toString(16).padStart(2,"0")}`;
    const glowColor = `rgba(${cr},${cg},${cb},0.32)`;
    const edgeStroke = `rgba(${cr},${cg},${cb},0.40)`;
    const particleHead = `rgba(${cr},${cg},${cb},0.9)`;
    const particleTailEnd = `rgba(${cr},${cg},${cb},0.6)`;
    const particleGlow = `rgba(${cr},${cg},${cb},0.3)`;

    const toScreen = (fx: number, fy: number) => ({ x: fx * zoom + vx, y: fy * zoom + vy });

    // ── Node screen centers (with float offset) ───────────────────────────────
    const centerMap = new Map<string, { x: number; y: number }>();
    for (const n of ns) {
      if (!floatCache.current.has(n.id)) floatCache.current.set(n.id, floatOf(n.id));
      const fp = floatCache.current.get(n.id)!;
      const fx = n.x + n.width / 2 + Math.sin(t * fp.fx * Math.PI * 2 + fp.px) * fp.ax;
      const fy = n.y + n.height / 2 + Math.sin(t * fp.fy * Math.PI * 2 + fp.py) * fp.ay;
      centerMap.set(n.id, toScreen(fx, fy));
    }

    // ── Edges ─────────────────────────────────────────────────────────────────
    ctx.strokeStyle = edgeStroke;
    ctx.lineWidth = 1;
    for (const e of es) {
      const a = centerMap.get(e.source);
      const b = centerMap.get(e.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // ── Edge particles ────────────────────────────────────────────────────────
    if (liveModeRef.current) for (const e of es) {
      const a = centerMap.get(e.source);
      const b = centerMap.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 20) continue;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const offset = i / PARTICLE_COUNT;
        const progress = ((t * PARTICLE_SPEED + offset) % 1 + 1) % 1;
        const px = a.x + (b.x - a.x) * progress;
        const py = a.y + (b.y - a.y) * progress;
        const tailProg = Math.max(0, progress - 0.06);
        const tx = a.x + (b.x - a.x) * tailProg;
        const ty = a.y + (b.y - a.y) * tailProg;
        const tailGrad = ctx.createLinearGradient(tx, ty, px, py);
        tailGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        tailGrad.addColorStop(1, particleTailEnd);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        const pBoost = fxAmbientOn ? falloff(px, py) * fxK : 0;
        const pr = PARTICLE_R * (1 + 0.6 * pBoost) * zoom;
        const glowR = pr + (5 + 9 * pBoost) * zoom;
        ctx.strokeStyle = tailGrad;
        ctx.lineWidth = 1.5 * zoom;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = particleHead;
        ctx.fill();
        const glow = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        glow.addColorStop(0, particleGlow);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(px, py, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }
    }

    // ── Node dots ─────────────────────────────────────────────────────────────
    for (const n of ns) {
      const sc = centerMap.get(n.id)!;
      // Cursor proximity boost: nearby dots glow wider and brighter.
      const boost = fxAmbientOn ? falloff(sc.x, sc.y) * fxK : 0;
      const haloR = NODE_R + 8 + 14 * boost;
      // Glow halo
      const grad = ctx.createRadialGradient(sc.x, sc.y, NODE_R * 0.4, sc.x, sc.y, haloR);
      grad.addColorStop(0, boost > 0.01 ? `rgba(${cr},${cg},${cb},${(0.32 + 0.38 * boost).toFixed(3)})` : glowColor);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, haloR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      // Core dot
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, NODE_R * (1 + 0.5 * boost), 0, Math.PI * 2);
      ctx.fillStyle = dotColor2;
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfInstance]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div ref={containerEl} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      <canvas ref={canvasEl} style={{ display: "block" }} />
    </div>
  );
}

// ─── Hover FX — cursor-proximity reaction for node cards ─────────────────────
// Styles are applied imperatively to each card's inner element (never to
// .react-flow__node itself, whose transform React Flow owns) so mouse moves
// cost zero React re-renders. The "hover" style is pure CSS (data-fx attr on
// the canvas wrapper); this engine drives "proximity" and "ripple".

function CanvasHoverFX({ wrapperRef, enabled, fxStyle, intensity }: {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  fxStyle: "hover" | "proximity" | "ripple";
  intensity: number;
}) {
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const reset = () => {
      wrapper.querySelectorAll<HTMLElement>(".react-flow__node").forEach((nodeEl) => {
        const el = nodeEl.firstElementChild as HTMLElement | null;
        if (el) { el.style.filter = ""; el.style.transform = ""; }
      });
    };
    if (!enabled || fxStyle === "hover" || intensity <= 0) { reset(); return; }

    let mouseX = -1e6, mouseY = -1e6;
    let raf = 0, lastScan = -1e6;
    let targets: { el: HTMLElement; cx: number; cy: number; r: number; active: boolean }[] = [];
    const k = Math.min(1, intensity / 100);
    const radius = 200 + 260 * k;

    const onMove = (e: PointerEvent) => { mouseX = e.clientX; mouseY = e.clientY; };
    const onLeave = () => { mouseX = -1e6; mouseY = -1e6; };

    const tick = (t: number) => {
      // Re-measure card rects ~8×/s, not per frame — cheap and close enough,
      // since pans/zooms only lag the falloff by one scan interval.
      if (t - lastScan > 120) {
        lastScan = t;
        targets = Array.from(wrapper.querySelectorAll<HTMLElement>(".react-flow__node")).flatMap((nodeEl) => {
          const el = nodeEl.firstElementChild as HTMLElement | null;
          if (!el) return [];
          const rect = nodeEl.getBoundingClientRect();
          return [{
            el,
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            r: Math.max(rect.width, rect.height) / 2,
            active: el.style.filter !== "",
          }];
        });
      }
      for (const tgt of targets) {
        // Distance from the card's edge (not center), so large cards react too
        const d = Math.max(0, Math.hypot(mouseX - tgt.cx, mouseY - tgt.cy) - tgt.r);
        const f = 1 - d / radius;
        if (f > 0.02) {
          const e = f * f * (3 - 2 * f);
          tgt.el.style.filter = `brightness(${(1 + 0.22 * k * e).toFixed(3)}) drop-shadow(0 0 ${(16 * k * e).toFixed(1)}px var(--ms-node-glow))`;
          tgt.el.style.transform = `translateY(${(-4 * k * e).toFixed(2)}px) scale(${(1 + 0.014 * k * e).toFixed(4)})`;
          tgt.active = true;
        } else if (tgt.active) {
          tgt.el.style.filter = "";
          tgt.el.style.transform = "";
          tgt.active = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      reset();
    };
  }, [wrapperRef, enabled, fxStyle, intensity]);

  return null;
}

// ─── ReactFlow setup ──────────────────────────────────────────────────────────

const edgeTypes = { default: DeletableEdge };
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.5 };

function toRFNode(n: MindNode): Node {
  return {
    id: n.id, type: n.type,
    position: { x: n.x, y: n.y },
    data: { mindNode: n },
    width: n.width, height: n.height,
    style: { width: n.width, height: n.height },
    draggable: !n.locked,
    className: n.locked ? "ms-node-locked" : undefined,
  };
}

function toRFEdge(e: { id: string; source: string; target: string }): Edge {
  return { id: e.id, source: e.source, target: e.target, type: "default", animated: false };
}

interface PickerState { screenPos: { x: number; y: number }; flowPos: { x: number; y: number }; }

function menuBtn(extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8, width: "100%",
    background: "none", border: "none", borderRadius: 7,
    color: "var(--ms-text-muted)", fontSize: 12.5, padding: "7px 10px",
    cursor: "pointer", textAlign: "left", transition: "all 0.1s ease",
    ...extra,
  };
}

// ─── Main canvas inner ────────────────────────────────────────────────────────

function CanvasInner() {
  const {
    nodes: mindNodes,
    edges: mindEdges,
    activeCanvasId,
    settings,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    deleteEdge,
    setEditingNodeId,
    pendingFocusNodeId,
    setPendingFocusNodeId,
    runBatch,
  } = useStore();

  const reactFlowInstance = useReactFlow();
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const mindNodesRef = useRef(mindNodes);
  useEffect(() => { mindNodesRef.current = mindNodes; }, [mindNodes]);

  // Jump-to-node from the search palette: once the target node is loaded,
  // center the viewport on it and select it.
  useEffect(() => {
    if (!pendingFocusNodeId) return;
    const n = mindNodes.find((x) => x.id === pendingFocusNodeId);
    if (!n) return;
    reactFlowInstance.setCenter(n.x + n.width / 2, n.y + n.height / 2, {
      zoom: Math.max(reactFlowInstance.getZoom(), 0.85),
      duration: 400,
    });
    try { reactFlowInstance.updateNode(n.id, { selected: true }); } catch { /* older RF */ }
    setPendingFocusNodeId(null);
  }, [pendingFocusNodeId, mindNodes, reactFlowInstance, setPendingFocusNodeId]);

  // Cache RF node conversion per store object: unchanged MindNodes keep their
  // identity across store updates, so React Flow can skip re-syncing them.
  const rfNodeCache = useRef(new WeakMap<MindNode, Node>()).current;
  const rfNodes: Node[] = useMemo(
    () =>
      [...mindNodes]
        .sort((a, b) => (a.type === "group" ? -1 : b.type === "group" ? 1 : 0))
        .map((n) => {
          let cached = rfNodeCache.get(n);
          if (!cached) {
            cached = toRFNode(n);
            rfNodeCache.set(n, cached);
          }
          return cached;
        }),
    [mindNodes, rfNodeCache]
  );
  const rfEdges: Edge[] = useMemo(() => mindEdges.map(toRFEdge), [mindEdges]);

  const snapGrid = useMemo(
    () => [settings.grid_size, settings.grid_size] as [number, number],
    [settings.grid_size]
  );

  const backgroundFx = useMemo<BackgroundFx>(
    () => ({
      enabled: settings.canvas_fx_enabled ?? true,
      style: settings.canvas_fx_style ?? "proximity",
      intensity: settings.canvas_fx_intensity ?? 60,
      ambient: settings.canvas_fx_ambient ?? true,
    }),
    [settings.canvas_fx_enabled, settings.canvas_fx_style, settings.canvas_fx_intensity, settings.canvas_fx_ambient]
  );

  // Stable identity + same-array bail-out: React Flow re-fires selection
  // handlers when their identity changes, so an inline handler that always
  // sets a fresh array re-renders forever once nodes exist.
  const handleSelectionChange = useCallback(
    ({ nodes }: { nodes: Node[] }) => {
      setSelectedIds((prev) => {
        const ids = nodes.map((n) => n.id);
        return prev.length === ids.length && prev.every((v, i) => v === ids[i]) ? prev : ids;
      });
    },
    []
  );

  // ── Node picker ─────────────────────────────────────────────────────────────
  const openPicker = useCallback((screenX: number, screenY: number) => {
    const flowPos = reactFlowInstance.screenToFlowPosition({ x: screenX, y: screenY });
    setPicker({ screenPos: { x: screenX, y: screenY }, flowPos });
  }, [reactFlowInstance]);

  const handlePaneDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); openPicker(e.clientX, e.clientY);
  }, [openPicker]);

  const handlePaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault(); openPicker(e.clientX, e.clientY);
  }, [openPicker]);

  const handlePickerSelect = useCallback(async (type: NodeType) => {
    if (!activeCanvasId || !picker) return;
    const size = getDefaultSize(type);
    await addNode({
      canvas_id: activeCanvasId, type,
      x: picker.flowPos.x - size.width / 2,
      y: picker.flowPos.y - size.height / 2,
      width: size.width, height: size.height,
      z_index: mindNodes.length, locked: false, parent_id: null,
      data: getDefaultData(type) as any,
    });
    sounds.spawn();
    setPicker(null);
  }, [activeCanvasId, picker, mindNodes.length, addNode]);

  // ── Drag / position sync ────────────────────────────────────────────────────
  const handleNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
    const all = mindNodesRef.current;
    const mindNode = all.find((n) => n.id === node.id);
    if (mindNode?.type === "group") {
      const dx = node.position.x - mindNode.x;
      const dy = node.position.y - mindNode.y;
      all.filter((n) => n.parent_id === node.id)
        .forEach((child) => updateNode(child.id, { x: child.x + dx, y: child.y + dy }));
    }
    updateNode(node.id, { x: node.position.x, y: node.position.y });
  }, [updateNode]);

  const handleSelectionDragStop = useCallback((_event: React.MouseEvent, nodes: Node[]) => {
    const all = mindNodesRef.current;
    const draggedIds = new Set(nodes.map((n) => n.id));
    nodes.forEach((node) => {
      const mindNode = all.find((n) => n.id === node.id);
      if (mindNode?.type === "group") {
        const dx = node.position.x - mindNode.x;
        const dy = node.position.y - mindNode.y;
        all.filter((n) => n.parent_id === node.id && !draggedIds.has(n.id))
          .forEach((child) => updateNode(child.id, { x: child.x + dx, y: child.y + dy }));
      }
      updateNode(node.id, { x: node.position.x, y: node.position.y });
    });
  }, [updateNode]);

  // ── Connect / delete ────────────────────────────────────────────────────────
  const handleConnect: OnConnect = useCallback((connection: Connection) => {
    if (!activeCanvasId || !connection.source || !connection.target) return;
    addEdge({ canvas_id: activeCanvasId, source: connection.source, target: connection.target });
    sounds.connect();
  }, [activeCanvasId, addEdge]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, _node) => {
    setEditingNodeId(null); setNodeMenu(null);
  }, [setEditingNodeId]);

  const handleNodesDelete: OnNodesDelete = useCallback((nodes) => {
    nodes.forEach((n) => deleteNode(n.id)); sounds.delete();
  }, [deleteNode]);

  const handleEdgesDelete: OnEdgesDelete = useCallback((edges) => {
    edges.forEach((e) => deleteEdge(e.id)); sounds.cut();
  }, [deleteEdge]);

  // ── Group selection ─────────────────────────────────────────────────────────
  const groupSelectedNodes = useCallback(async (ids: string[]) => {
    if (!activeCanvasId || ids.length < 2) return;
    const selected = mindNodesRef.current.filter((n) => ids.includes(n.id) && n.type !== "group");
    if (selected.length < 2) return;
    const PAD = 24;
    const minX = Math.min(...selected.map((n) => n.x)) - PAD;
    const minY = Math.min(...selected.map((n) => n.y)) - PAD - 28;
    const maxX = Math.max(...selected.map((n) => n.x + n.width)) + PAD;
    const maxY = Math.max(...selected.map((n) => n.y + n.height)) + PAD;
    await runBatch(async () => {
      const group = await addNode({
        canvas_id: activeCanvasId, type: "group",
        x: minX, y: minY, width: maxX - minX, height: maxY - minY,
        z_index: 0, locked: false, parent_id: null,
        data: { label: "Group", color: "" } as any,
      });
      for (const node of selected) await updateNode(node.id, { parent_id: group.id });
    });
    sounds.spawn();
    setNodeMenu(null);
  }, [activeCanvasId, addNode, updateNode, runBatch]);

  // ── Duplicate / align / distribute ──────────────────────────────────────────
  const duplicateSelected = useCallback(async () => {
    const sel = reactFlowInstance.getNodes().filter((n) => n.selected);
    if (sel.length === 0 || !activeCanvasId) return;
    await runBatch(async () => {
      for (const rf of sel) {
        const mn = mindNodesRef.current.find((n) => n.id === rf.id);
        if (!mn || mn.type === "group") continue;
        await addNode({
          canvas_id: mn.canvas_id, type: mn.type,
          x: mn.x + 28, y: mn.y + 28, width: mn.width, height: mn.height,
          z_index: mindNodesRef.current.length, locked: false, parent_id: null,
          data: JSON.parse(JSON.stringify(mn.data)),
        });
      }
    });
    sounds.spawn();
  }, [reactFlowInstance, activeCanvasId, addNode, runBatch]);

  type AlignMode = "left" | "centerH" | "right" | "top" | "middleV" | "bottom" | "distH" | "distV";

  const alignSelected = useCallback(async (mode: AlignMode) => {
    const sel = mindNodesRef.current.filter((n) => selectedIds.includes(n.id) && !n.locked);
    if (sel.length < 2) return;
    await runBatch(async () => {
      switch (mode) {
        case "left": {
          const v = Math.min(...sel.map((n) => n.x));
          for (const n of sel) await updateNode(n.id, { x: v });
          break;
        }
        case "right": {
          const v = Math.max(...sel.map((n) => n.x + n.width));
          for (const n of sel) await updateNode(n.id, { x: v - n.width });
          break;
        }
        case "centerH": {
          const v = sel.reduce((a, n) => a + n.x + n.width / 2, 0) / sel.length;
          for (const n of sel) await updateNode(n.id, { x: v - n.width / 2 });
          break;
        }
        case "top": {
          const v = Math.min(...sel.map((n) => n.y));
          for (const n of sel) await updateNode(n.id, { y: v });
          break;
        }
        case "bottom": {
          const v = Math.max(...sel.map((n) => n.y + n.height));
          for (const n of sel) await updateNode(n.id, { y: v - n.height });
          break;
        }
        case "middleV": {
          const v = sel.reduce((a, n) => a + n.y + n.height / 2, 0) / sel.length;
          for (const n of sel) await updateNode(n.id, { y: v - n.height / 2 });
          break;
        }
        case "distH": {
          const sorted = [...sel].sort((a, b) => a.x - b.x);
          const first = sorted[0];
          const last = sorted[sorted.length - 1];
          const totalW = sorted.reduce((a, n) => a + n.width, 0);
          const gap = (last.x + last.width - first.x - totalW) / (sorted.length - 1);
          let cursor = first.x;
          for (const n of sorted) {
            await updateNode(n.id, { x: cursor });
            cursor += n.width + gap;
          }
          break;
        }
        case "distV": {
          const sorted = [...sel].sort((a, b) => a.y - b.y);
          const first = sorted[0];
          const last = sorted[sorted.length - 1];
          const totalH = sorted.reduce((a, n) => a + n.height, 0);
          const gap = (last.y + last.height - first.y - totalH) / (sorted.length - 1);
          let cursor = first.y;
          for (const n of sorted) {
            await updateNode(n.id, { y: cursor });
            cursor += n.height + gap;
          }
          break;
        }
      }
    });
    sounds.click();
  }, [selectedIds, runBatch, updateNode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setPicker(null); setEditingNodeId(null); setNodeMenu(null); return; }
    if (!(e.metaKey || e.ctrlKey)) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    const key = e.key.toLowerCase();
    if (key === "d") {
      e.preventDefault();
      duplicateSelected();
    } else if (key === "g") {
      e.preventDefault();
      const ids = reactFlowInstance.getNodes().filter((n) => n.selected).map((n) => n.id);
      groupSelectedNodes(ids);
    }
  }, [setEditingNodeId, duplicateSelected, groupSelectedNodes, reactFlowInstance]);

  // ── Node context menu ───────────────────────────────────────────────────────
  const handleNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeMenu({ nodeId: node.id, x: (event as unknown as MouseEvent).clientX, y: (event as unknown as MouseEvent).clientY });
  }, []);

  // ── Empty canvas ────────────────────────────────────────────────────────────
  if (!activeCanvasId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--ms-bg)", flexDirection: "column", gap: 12 }}>
        <MindSpaceLogo size={52} color="var(--ms-text-muted)" />
        <div style={{ color: "var(--ms-text-muted)", fontSize: 15, fontWeight: 500 }}>Select or create a canvas to begin</div>
      </div>
    );
  }

  // ── Context menu ────────────────────────────────────────────────────────────
  const renderNodeMenu = () => {
    if (!nodeMenu) return null;
    const node = mindNodes.find((n) => n.id === nodeMenu.nodeId);
    if (!node) return null;

    const selectedRF = reactFlowInstance.getNodes().filter((n) => n.selected);
    const selectedIds = selectedRF.map((n) => n.id);
    const canGroup = selectedIds.length >= 2 && selectedIds.every((id) => {
      const mn = mindNodes.find((n) => n.id === id);
      return mn && mn.type !== "group";
    });
    const isGroup = node.type === "group";
    const hasParent = !!node.parent_id;
    const existingGroups = mindNodes.filter((n) => n.type === "group" && n.id !== node.id);
    const sep = <div style={{ height: 1, background: "var(--ms-border)", margin: "3px 0" }} />;

    const hoverOn = (e: React.MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--ms-accent-15)"; el.style.color = "var(--ms-text)"; };
    const hoverOff = (e: React.MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = "none"; el.style.color = "var(--ms-text-muted)"; };

    return (
      <div style={{ position: "fixed", left: nodeMenu.x, top: nodeMenu.y, zIndex: 9999, background: "rgba(13,16,40,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, boxShadow: "0 8px 48px rgba(0,0,0,0.65)", padding: "5px", minWidth: 180 }}>
        <button onClick={() => { updateNode(node.id, { locked: !node.locked }); setNodeMenu(null); }} style={menuBtn()} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          {node.locked ? <Unlock size={13} /> : <Lock size={13} />}
          {node.locked ? "Unlock Position" : "Lock Position"}
        </button>
        {sep}
        {isGroup && (
          <button onClick={() => { mindNodes.filter((n) => n.parent_id === node.id).forEach((c) => updateNode(c.id, { parent_id: null })); deleteNode(node.id); setNodeMenu(null); }} style={menuBtn()} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            <Ungroup size={13} /> Ungroup All
          </button>
        )}
        {!isGroup && hasParent && (
          <button onClick={() => { updateNode(node.id, { parent_id: null }); setNodeMenu(null); }} style={menuBtn()} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            <Ungroup size={13} /> Remove from Group
          </button>
        )}
        {!isGroup && !hasParent && existingGroups.map((g) => {
          const gd = g.data as { label?: string };
          return (
            <button key={g.id} onClick={() => { updateNode(node.id, { parent_id: g.id }); setNodeMenu(null); }} style={menuBtn()} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              <Group size={13} /> Add to "{gd.label || "Group"}"
            </button>
          );
        })}
        {canGroup && (
          <button onClick={() => groupSelectedNodes(selectedIds)} style={menuBtn({ color: "var(--ms-accent)" })} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            <Group size={13} /> Group {selectedIds.length} nodes
          </button>
        )}
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      ref={reactFlowWrapper}
      className={`ms-flow-wrap ${settings.edge_particles ? "live-mode" : "plain-mode"}`}
      data-fx={settings.canvas_fx_enabled && (settings.canvas_fx_cards ?? true) ? settings.canvas_fx_style : "off"}
      style={{
        flex: 1, width: "100%", height: "100%", position: "relative",
        ["--ms-node-dot" as any]: settings.node_color || "var(--ms-accent)",
        ["--ms-node-opacity" as any]: settings.node_opacity ?? 1,
        ["--ms-fx-k" as any]: Math.min(1, (settings.canvas_fx_intensity ?? 60) / 100),
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Dot-grid + glow-dot background canvas — always behind ReactFlow */}
      <BackgroundCanvas
        nodes={mindNodes}
        edges={mindEdges}
        liveMode={settings.edge_particles ?? true}
        nodeColor={settings.node_color ?? ""}
        gridSize={settings.grid_size ?? 20}
        gridOpacity={settings.grid_opacity ?? 1}
        gridColor={settings.grid_color ?? "subtle"}
        fx={backgroundFx}
      />

      {/* Cursor-proximity reaction for the node cards (imperative, no re-renders) */}
      <CanvasHoverFX
        wrapperRef={reactFlowWrapper}
        enabled={(settings.canvas_fx_enabled ?? true) && (settings.canvas_fx_cards ?? true)}
        fxStyle={settings.canvas_fx_style ?? "proximity"}
        intensity={settings.canvas_fx_intensity ?? 60}
      />

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes as any}
        edgeTypes={edgeTypes}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onPaneClick={() => { setPicker(null); setNodeMenu(null); }}
        onSelectionChange={handleSelectionChange}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onDoubleClick={handlePaneDoubleClick}
        snapToGrid={settings.snap_to_grid}
        snapGrid={snapGrid}
        deleteKeyCode={["Backspace", "Delete"]}
        panOnScroll={true}
        panOnDrag={true}
        selectionOnDrag={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Shift"
        onSelectionDragStop={handleSelectionDragStop}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.1}
        maxZoom={3}
        style={{ background: "transparent", position: "relative", zIndex: 1 }}
      >
        {/* No <Background> — handled by BackgroundCanvas */}
        <Controls style={{ bottom: 24, left: 24 }} showInteractive={false} />
        <MiniMap
          style={{ background: "rgba(13,16,40,0.85)", borderRadius: 14 }}
          maskColor="rgba(0,0,0,0.45)"
          nodeColor={settings.node_color || "var(--ms-accent)"}
        />
      </ReactFlow>

      {/* Alignment toolbar — appears when 2+ nodes are selected */}
      {selectedIds.length >= 2 && (
        <div
          style={{
            position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
            zIndex: 60, display: "flex", alignItems: "center", gap: 2,
            background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
            borderRadius: 10, padding: 4, boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          }}
        >
          {([
            { mode: "left" as const, title: "Align left", icon: <AlignStartVertical size={13} /> },
            { mode: "centerH" as const, title: "Align horizontal centers", icon: <AlignCenterVertical size={13} /> },
            { mode: "right" as const, title: "Align right", icon: <AlignEndVertical size={13} /> },
            { mode: "top" as const, title: "Align top", icon: <AlignStartHorizontal size={13} /> },
            { mode: "middleV" as const, title: "Align vertical centers", icon: <AlignCenterHorizontal size={13} /> },
            { mode: "bottom" as const, title: "Align bottom", icon: <AlignEndHorizontal size={13} /> },
          ]).map((b) => (
            <button key={b.mode} title={b.title} onClick={() => alignSelected(b.mode)}
              style={menuBtn({ width: "auto", padding: "6px 7px" })}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--ms-accent-15)"; (e.currentTarget as HTMLElement).style.color = "var(--ms-text)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "var(--ms-text-muted)"; }}>
              {b.icon}
            </button>
          ))}
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--ms-border)", margin: "2px 3px" }} />
          {selectedIds.length >= 3 && ([
            { mode: "distH" as const, title: "Distribute horizontally", icon: <AlignHorizontalSpaceBetween size={13} /> },
            { mode: "distV" as const, title: "Distribute vertically", icon: <AlignVerticalSpaceBetween size={13} /> },
          ]).map((b) => (
            <button key={b.mode} title={b.title} onClick={() => alignSelected(b.mode)}
              style={menuBtn({ width: "auto", padding: "6px 7px" })}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--ms-accent-15)"; (e.currentTarget as HTMLElement).style.color = "var(--ms-text)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "var(--ms-text-muted)"; }}>
              {b.icon}
            </button>
          ))}
          <button title="Group selection (⌘G)" onClick={() => groupSelectedNodes(selectedIds)}
            style={menuBtn({ width: "auto", padding: "6px 7px", color: "var(--ms-accent)" })}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--ms-accent-15)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
            <Group size={13} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {picker && (
          <NodePicker
            position={picker.screenPos}
            onSelect={handlePickerSelect}
            onClose={() => setPicker(null)}
          />
        )}
      </AnimatePresence>

      {renderNodeMenu()}
    </div>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

export default Canvas;
