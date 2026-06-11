import { useCallback, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Timer, Play, Pause, SkipForward, RotateCcw, Trash2, Settings } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, PomodoroData } from "../../types";

export type PomodoroNodeType = Node<{ mindNode: MindNode }, "pomodoro">;

const ACCENT = "#ef4444";

function formatMMSS(ms: number): string {
  const totalSecs = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getPhaseDurationMs(d: PomodoroData): number {
  if (d.phase === "work") return d.work_minutes * 60 * 1000;
  if (d.phase === "break") return d.break_minutes * 60 * 1000;
  if (d.phase === "long-break") return d.long_break_minutes * 60 * 1000;
  return d.work_minutes * 60 * 1000;
}

function getPhaseColor(phase: PomodoroData["phase"]): string {
  if (phase === "work") return "#ef4444";
  if (phase === "break") return "#22c55e";
  if (phase === "long-break") return "#3b82f6";
  return "var(--ms-text-muted)";
}

function getPhaseLabel(phase: PomodoroData["phase"]): string {
  if (phase === "work") return "Focus";
  if (phase === "break") return "Short Break";
  if (phase === "long-break") return "Long Break";
  return "Ready";
}

export function PomodoroNode({ data, selected }: NodeProps<PomodoroNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as PomodoroData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [displayMs, setDisplayMs] = useState<number>(() => {
    if (d.phase === "idle") return d.work_minutes * 60 * 1000;
    if (d.paused_remaining_ms !== null) return d.paused_remaining_ms;
    if (d.started_at) {
      const elapsed = Date.now() - new Date(d.started_at).getTime();
      return Math.max(0, getPhaseDurationMs(d) - elapsed);
    }
    return getPhaseDurationMs(d);
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsWork, setSettingsWork] = useState(d.work_minutes);
  const [settingsBreak, setSettingsBreak] = useState(d.break_minutes);
  const [settingsLongBreak, setSettingsLongBreak] = useState(d.long_break_minutes);
  const [settingsSessions, setSettingsSessions] = useState(d.sessions_before_long);
  const advancingRef = useRef(false);

  const isRunning = d.phase !== "idle" && d.started_at !== null && d.paused_remaining_ms === null;

  const advancePhase = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    const nextSessionCount =
      d.phase === "work" ? d.session_count + 1 : d.session_count;
    let nextPhase: PomodoroData["phase"];
    if (d.phase === "work") {
      nextPhase =
        nextSessionCount % d.sessions_before_long === 0 ? "long-break" : "break";
    } else {
      nextPhase = "work";
    }
    const newData: PomodoroData = {
      ...d,
      phase: nextPhase,
      session_count: nextSessionCount,
      started_at: new Date().toISOString(),
      paused_remaining_ms: null,
    };
    updateNode(mindNode.id, { data: newData });
    setTimeout(() => { advancingRef.current = false; }, 300);
  }, [d, mindNode.id, updateNode]);

  // Tick
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - new Date(d.started_at!).getTime();
      const remaining = Math.max(0, getPhaseDurationMs(d) - elapsed);
      setDisplayMs(remaining);
      if (remaining === 0) {
        clearInterval(id);
        advancePhase();
      }
    }, 100);
    return () => clearInterval(id);
  }, [isRunning, d.started_at, d.phase, d.work_minutes, d.break_minutes, d.long_break_minutes, advancePhase]);

  // Sync display when paused or idle
  useEffect(() => {
    if (d.paused_remaining_ms !== null) {
      setDisplayMs(d.paused_remaining_ms);
    } else if (d.phase === "idle") {
      setDisplayMs(d.work_minutes * 60 * 1000);
    }
  }, [d.paused_remaining_ms, d.phase, d.work_minutes]);

  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (d.phase === "idle") {
      // Start fresh
      updateNode(mindNode.id, {
        data: {
          ...d,
          phase: "work",
          started_at: new Date().toISOString(),
          paused_remaining_ms: null,
          session_count: 0,
        },
      });
    } else if (isRunning) {
      // Pause
      const elapsed = Date.now() - new Date(d.started_at!).getTime();
      const remaining = Math.max(0, getPhaseDurationMs(d) - elapsed);
      updateNode(mindNode.id, {
        data: { ...d, paused_remaining_ms: remaining },
      });
      setDisplayMs(remaining);
    } else {
      // Resume
      updateNode(mindNode.id, {
        data: {
          ...d,
          started_at: new Date().toISOString(),
          paused_remaining_ms: null,
        },
      });
      // Adjust started_at so remaining time is preserved
      const remaining = d.paused_remaining_ms ?? getPhaseDurationMs(d);
      const phaseDur = getPhaseDurationMs(d);
      const fakeStart = new Date(Date.now() - (phaseDur - remaining)).toISOString();
      updateNode(mindNode.id, {
        data: { ...d, started_at: fakeStart, paused_remaining_ms: null },
      });
    }
  }, [d, isRunning, mindNode.id, updateNode]);

  const handleSkip = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (d.phase === "idle") return;
    advancingRef.current = false;
    advancePhase();
  }, [d.phase, advancePhase]);

  const handleReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateNode(mindNode.id, {
      data: {
        ...d,
        phase: "idle",
        started_at: null,
        paused_remaining_ms: null,
        session_count: 0,
      },
    });
    setDisplayMs(d.work_minutes * 60 * 1000);
  }, [d, mindNode.id, updateNode]);

  const handleSaveSettings = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateNode(mindNode.id, {
      data: {
        ...d,
        work_minutes: settingsWork,
        break_minutes: settingsBreak,
        long_break_minutes: settingsLongBreak,
        sessions_before_long: settingsSessions,
        phase: "idle",
        started_at: null,
        paused_remaining_ms: null,
        session_count: 0,
      },
    });
    setDisplayMs(settingsWork * 60 * 1000);
    setShowSettings(false);
  }, [d, mindNode.id, updateNode, settingsWork, settingsBreak, settingsLongBreak, settingsSessions]);

  const phaseDurMs = getPhaseDurationMs(d);
  const progress = phaseDurMs > 0 ? 1 - displayMs / phaseDurMs : 0;
  const phaseColor = getPhaseColor(d.phase);

  // SVG ring
  const R = 44;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = CIRC * (1 - progress);

  // Session dots: show last N sessions completed
  const totalDots = Math.min(d.session_count + (d.phase !== "idle" ? 0 : 0), 8);

  const btnBase: React.CSSProperties = {
    background: "var(--ms-border)",
    border: "1px solid var(--ms-border)",
    borderRadius: 6,
    color: "var(--ms-text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 8px",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={280}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: ACCENT, flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Timer size={14} color={ACCENT} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Pomodoro</span>
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); setShowSettings(v => !v); setSettingsWork(d.work_minutes); setSettingsBreak(d.break_minutes); setSettingsLongBreak(d.long_break_minutes); setSettingsSessions(d.sessions_before_long); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: showSettings ? ACCENT : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <Settings size={11} />
        </button>
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <div className="ms-node-body nodrag nopan" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "10px 12px" }}>
        {showSettings ? (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ms-text)", marginBottom: 2 }}>Settings</span>
            {(
              [
                { label: "Work (min)", value: settingsWork, set: setSettingsWork, min: 1, max: 120 },
                { label: "Break (min)", value: settingsBreak, set: setSettingsBreak, min: 1, max: 60 },
                { label: "Long break (min)", value: settingsLongBreak, set: setSettingsLongBreak, min: 1, max: 120 },
                { label: "Sessions before long", value: settingsSessions, set: setSettingsSessions, min: 1, max: 10 },
              ] as const
            ).map(({ label, value, set, min, max }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--ms-text-muted)", flex: 1 }}>{label}</span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={value}
                  onChange={(e) => (set as (v: number) => void)(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 48, background: "var(--ms-border)", border: "1px solid var(--ms-border)", borderRadius: 4, color: "var(--ms-text)", fontSize: 12, padding: "2px 4px", textAlign: "center", outline: "none", userSelect: "text" }}
                />
              </div>
            ))}
            <button
              onClick={handleSaveSettings}
              style={{ marginTop: 4, padding: "5px 10px", background: ACCENT, border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Apply & Reset
            </button>
          </div>
        ) : (
          <>
            {/* Ring */}
            <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
              <svg width={110} height={110} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={55} cy={55} r={R} fill="none" stroke="var(--ms-border)" strokeWidth={8} />
                <circle
                  cx={55}
                  cy={55}
                  r={R}
                  fill="none"
                  stroke={phaseColor}
                  strokeWidth={8}
                  strokeDasharray={CIRC}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.15s linear, stroke 0.3s" }}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ms-text)", letterSpacing: 1 }}>
                  {formatMMSS(displayMs)}
                </span>
              </div>
            </div>

            {/* Phase label */}
            <span style={{ fontSize: 12, fontWeight: 600, color: phaseColor, letterSpacing: 0.5 }}>
              {getPhaseLabel(d.phase)}
            </span>

            {/* Session dots */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", minHeight: 14 }}>
              {Array.from({ length: Math.min(totalDots, 8) }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: i % (d.sessions_before_long) === d.sessions_before_long - 1 ? "#3b82f6" : "#ef4444",
                    display: "inline-block",
                  }}
                />
              ))}
              {d.session_count === 0 && (
                <span style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>No sessions yet</span>
              )}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
              <button style={btnBase} onClick={handlePlayPause} title={isRunning ? "Pause" : "Play"}>
                {isRunning ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button style={btnBase} onClick={handleSkip} title="Skip phase" disabled={d.phase === "idle"}>
                <SkipForward size={14} />
              </button>
              <button style={btnBase} onClick={handleReset} title="Reset">
                <RotateCcw size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default PomodoroNode;
