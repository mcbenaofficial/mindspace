import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion, AnimatePresence } from "framer-motion";
import { Hourglass, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, HourglassData } from "../../types";

export type HourglassNodeType = Node<{ mindNode: MindNode }, "hourglass">;

const ACCENT = "#f59e0b";
const SAND_TOP = "#f59e0b";
const SAND_BOT = "#d97706";

function pad(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatTime(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

// Compute elapsed ms at any given moment
function computeElapsed(d: HourglassData): number {
  if (!d.started_at) return 0;
  const startMs = new Date(d.started_at).getTime();
  const now = Date.now();
  let elapsed: number;
  if (d.paused_at) {
    elapsed = new Date(d.paused_at).getTime() - startMs - d.total_paused_ms;
  } else {
    elapsed = now - startMs - d.total_paused_ms;
  }
  return Math.max(0, elapsed);
}

// Progress [0, 1] where 1 = fully elapsed
function computeProgress(d: HourglassData): number {
  const totalMs = d.duration_minutes * 60 * 1000;
  if (totalMs === 0) return 0;
  const elapsed = computeElapsed(d);
  return Math.min(1, elapsed / totalMs);
}

interface HourglassSVGProps {
  progress: number; // 0..1
  color: string;    // accent color
}

// SVG hourglass: waist at center, sand fills from the middle out in each half
function HourglassSVG({ progress, color }: HourglassSVGProps) {
  const W = 80;
  const H = 100;
  const cx = W / 2;
  // Hourglass outline points
  // Top trapezoid: top-wide, narrows to center
  // Bottom trapezoid: narrow at center, widens to bottom
  const topY = 4;
  const botY = H - 4;
  const midY = H / 2;
  const sideInset = 4; // horizontal gap at waist
  const topWidth = W - 8;
  const halfTop = topWidth / 2;

  // Outline path
  const outline = [
    `M ${cx - halfTop} ${topY}`,
    `L ${cx + halfTop} ${topY}`,
    `L ${cx + sideInset} ${midY}`,
    `L ${cx + halfTop} ${botY}`,
    `L ${cx - halfTop} ${botY}`,
    `L ${cx - sideInset} ${midY}`,
    `Z`,
  ].join(" ");

  // Top half clip region (above midY)
  const topClipId = "hg-top-clip";
  const botClipId = "hg-bot-clip";

  // Sand in top: fills from bottom of the top half upward (decreases as progress grows)
  // At progress=0: top sand is full; at progress=1: top sand is empty
  const topSandRatio = 1 - progress; // 1→0
  // The top half spans from topY to midY
  const topHalfH = midY - topY;
  // Sand fill height within top half
  const topSandH = topHalfH * topSandRatio;
  const topSandY = midY - topSandH;

  // Sand in bottom: fills from top of bottom half downward (increases as progress grows)
  const botSandRatio = progress; // 0→1
  const botHalfH = botY - midY;
  const botSandH = botHalfH * botSandRatio;
  const botSandY = midY;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <clipPath id={topClipId}>
          <polygon points={`
            ${cx - halfTop},${topY}
            ${cx + halfTop},${topY}
            ${cx + sideInset},${midY}
            ${cx - sideInset},${midY}
          `} />
        </clipPath>
        <clipPath id={botClipId}>
          <polygon points={`
            ${cx - sideInset},${midY}
            ${cx + sideInset},${midY}
            ${cx + halfTop},${botY}
            ${cx - halfTop},${botY}
          `} />
        </clipPath>
        <linearGradient id="sandGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SAND_TOP} />
          <stop offset="100%" stopColor={SAND_BOT} />
        </linearGradient>
      </defs>

      {/* Background shape (dark fill) */}
      <path
        d={outline}
        fill="color-mix(in srgb, var(--ms-border) 60%, transparent)"
        stroke="var(--ms-border)"
        strokeWidth={1.5}
      />

      {/* Top sand */}
      {topSandH > 0.5 && (
        <rect
          x={0}
          y={topSandY}
          width={W}
          height={topSandH + 1}
          fill="url(#sandGrad)"
          clipPath={`url(#${topClipId})`}
        />
      )}

      {/* Bottom sand */}
      {botSandH > 0.5 && (
        <rect
          x={0}
          y={botSandY}
          width={W}
          height={botSandH}
          fill="url(#sandGrad)"
          clipPath={`url(#${botClipId})`}
        />
      )}

      {/* Outline on top */}
      <path
        d={outline}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Waist dot */}
      <circle cx={cx} cy={midY} r={2} fill={color} opacity={0.7} />
    </svg>
  );
}

// Falling particle animation for when the timer is running
function SandParticle({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="particle"
          initial={{ y: -2, opacity: 0.9 }}
          animate={{ y: 14, opacity: 0 }}
          exit={{}}
          transition={{ duration: 0.6, ease: "easeIn", repeat: Infinity, repeatDelay: 0.2 }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: SAND_TOP,
            pointerEvents: "none",
          }}
        />
      )}
    </AnimatePresence>
  );
}

export function HourglassNode({ data, selected }: NodeProps<HourglassNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as HourglassData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [now, setNow] = useState(() => Date.now());
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(d.title);
  const [durationInput, setDurationInput] = useState(String(d.duration_minutes));
  const titleInputRef = useRef<HTMLInputElement>(null);

  const isRunning = !!d.started_at && !d.paused_at;
  const isIdle = !d.started_at;
  const totalMs = d.duration_minutes * 60 * 1000;
  const elapsed = computeElapsed(d);
  const remaining = Math.max(0, totalMs - elapsed);
  const progress = computeProgress(d);
  const finished = progress >= 1 && !isIdle;

  // Tick
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [isRunning]);

  // Stop automatically when finished
  useEffect(() => {
    if (isRunning && remaining === 0) {
      updateNode(mindNode.id, {
        data: {
          ...d,
          paused_at: new Date().toISOString(),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, remaining, isRunning]);

  const handlePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const nowIso = new Date().toISOString();
      if (isIdle) {
        // Fresh start
        updateNode(mindNode.id, {
          data: { ...d, started_at: nowIso, paused_at: null, total_paused_ms: 0 },
        });
      } else if (d.paused_at && !finished) {
        // Resume: accumulate paused time
        const pausedDuration = Date.now() - new Date(d.paused_at).getTime();
        updateNode(mindNode.id, {
          data: {
            ...d,
            paused_at: null,
            total_paused_ms: d.total_paused_ms + pausedDuration,
          },
        });
      }
    },
    [d, isIdle, finished, mindNode.id, updateNode]
  );

  const handlePause = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isRunning) return;
      updateNode(mindNode.id, {
        data: { ...d, paused_at: new Date().toISOString() },
      });
    },
    [d, isRunning, mindNode.id, updateNode]
  );

  const handleReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateNode(mindNode.id, {
        data: { ...d, started_at: null, paused_at: null, total_paused_ms: 0 },
      });
    },
    [d, mindNode.id, updateNode]
  );

  const handleDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDurationInput(e.target.value);
    },
    []
  );

  const handleDurationBlur = useCallback(() => {
    const val = Math.max(1, Math.min(180, parseInt(durationInput) || 1));
    setDurationInput(String(val));
    if (val !== d.duration_minutes) {
      updateNode(mindNode.id, {
        data: { ...d, duration_minutes: val, started_at: null, paused_at: null, total_paused_ms: 0 },
      });
    }
  }, [durationInput, d, mindNode.id, updateNode]);

  const saveTitle = useCallback(() => {
    setEditingTitle(false);
    if (titleValue !== d.title) {
      updateNode(mindNode.id, { data: { ...d, title: titleValue } });
    }
  }, [titleValue, d, mindNode.id, updateNode]);

  // Color coding
  const progressColor = progress > 0.5 ? "#4ade80" : progress > 0.25 ? ACCENT : "#f87171";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={180}
        minHeight={260}
        isVisible={cmdDown}
        lineStyle={{ borderColor: ACCENT, borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: ACCENT, border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: ACCENT, flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Hourglass size={14} color={ACCENT} />
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); saveTitle(); } }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="nodrag nopan"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--ms-text)",
              fontSize: 13,
              fontWeight: 600,
              userSelect: "text",
              cursor: "text",
            }}
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditingTitle(true); setTimeout(() => titleInputRef.current?.select(), 0); }}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ms-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "text",
            }}
          >
            {d.title || "Hourglass"}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <div
        className="ms-node-body nodrag nopan"
        style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* SVG Hourglass */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HourglassSVG progress={finished ? 1 : progress} color={ACCENT} />
          <SandParticle active={isRunning && !finished} />
        </div>

        {/* Time remaining */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            color: finished ? "#f87171" : isIdle ? "var(--ms-text-muted)" : progressColor,
            letterSpacing: 1,
          }}
        >
          {finished ? "Done!" : formatTime(isIdle ? totalMs : remaining)}
        </div>

        {/* Progress bar */}
        {!isIdle && (
          <div style={{ width: "80%", height: 4, background: "var(--ms-border)", borderRadius: 2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.round(progress * 100)}%`,
                background: progressColor,
                borderRadius: 2,
                transition: "width 0.5s linear, background 0.5s",
              }}
            />
          </div>
        )}

        {/* Duration input (only when idle) */}
        {isIdle && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number"
              min={1}
              max={180}
              value={durationInput}
              onChange={handleDurationChange}
              onBlur={handleDurationBlur}
              onClick={(e) => e.stopPropagation()}
              className="nodrag nopan"
              style={{
                width: 52,
                background: "var(--ms-border)",
                border: "1px solid var(--ms-border)",
                borderRadius: 5,
                color: "var(--ms-text)",
                fontSize: 13,
                padding: "3px 6px",
                textAlign: "center",
                outline: "none",
                userSelect: "text",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--ms-text-muted)" }}>min</span>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Play / Pause */}
          {(isIdle || (d.paused_at && !finished)) ? (
            <button
              onClick={handlePlay}
              disabled={finished}
              style={{
                background: ACCENT,
                border: "none",
                borderRadius: 6,
                color: "#000",
                cursor: finished ? "default" : "pointer",
                padding: "5px 12px",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                opacity: finished ? 0.5 : 1,
              }}
            >
              <Play size={12} /> {isIdle ? "Start" : "Resume"}
            </button>
          ) : !finished ? (
            <button
              onClick={handlePause}
              style={{
                background: "var(--ms-border)",
                border: "none",
                borderRadius: 6,
                color: "var(--ms-text)",
                cursor: "pointer",
                padding: "5px 12px",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Pause size={12} /> Pause
            </button>
          ) : null}

          {/* Reset */}
          {!isIdle && (
            <button
              onClick={handleReset}
              style={{
                background: "none",
                border: "1px solid var(--ms-border)",
                borderRadius: 6,
                color: "var(--ms-text-muted)",
                cursor: "pointer",
                padding: "5px 10px",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
              }}
            >
              <RotateCcw size={11} /> Reset
            </button>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default HourglassNode;
