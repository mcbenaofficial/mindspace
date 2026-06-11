import React, { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { useCmdKey } from '../../hooks/useCmdKey';
import { motion } from "framer-motion";
import { Clock, Maximize2, Minimize2, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, ClockData } from "../../types";
import { sounds } from "../../lib/sound";

export type ClockNodeType = Node<{ mindNode: MindNode }, "clock">;

type TabType = "clock" | "stopwatch" | "timer";

function padTwo(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

function formatHMS(totalMs: number, showMs = false): string {
  const totalSecs = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const ms = Math.floor((totalMs % 1000) / 10);
  const base = `${padTwo(h)}:${padTwo(m)}:${padTwo(s)}`;
  return showMs ? `${base}.${padTwo(ms)}` : base;
}

function formatLiveTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function ClockNode({ data, selected }: NodeProps<ClockNodeType>) {
  const { mindNode } = data;
  const clockData = mindNode.data as ClockData;
  const { setEditingNodeId, updateNode, deleteNode } = useStore();

  const [activeTab, setActiveTab] = useState<TabType>(clockData.mode || "clock");
  const [clockTime, setClockTime] = useState(() => new Date());
  const [fullMode, setFullMode] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();

  // Stopwatch
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const swStartRef = useRef<number | null>(null);
  const swBaseRef = useRef(0);

  // Timer
  const initialTimerSecs = clockData.timer_seconds || 300;
  const [timerMinutes, setTimerMinutes] = useState(Math.floor(initialTimerSecs / 60));
  const [timerSeconds, setTimerSeconds] = useState(initialTimerSecs % 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(initialTimerSecs * 1000);
  const timerStartRef = useRef<number | null>(null);
  const timerBaseRef = useRef(initialTimerSecs * 1000);

  // Live clock tick
  useEffect(() => {
    if (activeTab !== "clock") return;
    const id = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [activeTab]);

  // Stopwatch tick
  useEffect(() => {
    if (!swRunning) return;
    const id = setInterval(() => {
      if (swStartRef.current !== null) {
        setSwElapsed(swBaseRef.current + Date.now() - swStartRef.current);
      }
    }, 50);
    return () => clearInterval(id);
  }, [swRunning]);

  // Timer countdown
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      if (timerStartRef.current !== null) {
        const elapsed = Date.now() - timerStartRef.current;
        const remaining = Math.max(0, timerBaseRef.current - elapsed);
        setTimerRemaining(remaining);
        if (remaining === 0) {
          setTimerRunning(false);
          timerStartRef.current = null;
          sounds.complete();
        }
      }
    }, 50);
    return () => clearInterval(id);
  }, [timerRunning]);

  const handleSwStartStop = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (swRunning) {
        swBaseRef.current = swElapsed;
        swStartRef.current = null;
        setSwRunning(false);
      } else {
        swStartRef.current = Date.now();
        setSwRunning(true);
      }
    },
    [swRunning, swElapsed]
  );

  const handleSwReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSwRunning(false);
    swStartRef.current = null;
    swBaseRef.current = 0;
    setSwElapsed(0);
  }, []);

  const handleTimerStartStop = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (timerRunning) {
        timerBaseRef.current = timerRemaining;
        timerStartRef.current = null;
        setTimerRunning(false);
      } else {
        if (timerRemaining === 0) {
          const total = (timerMinutes * 60 + timerSeconds) * 1000;
          timerBaseRef.current = total;
          setTimerRemaining(total);
          setTimeout(() => {
            timerStartRef.current = Date.now();
            setTimerRunning(true);
          }, 0);
        } else {
          timerStartRef.current = Date.now();
          setTimerRunning(true);
        }
      }
    },
    [timerRunning, timerRemaining, timerMinutes, timerSeconds]
  );

  const handleTimerReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setTimerRunning(false);
      timerStartRef.current = null;
      const total = (timerMinutes * 60 + timerSeconds) * 1000;
      timerBaseRef.current = total;
      setTimerRemaining(total);
    },
    [timerMinutes, timerSeconds]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNodeId(mindNode.id);
    },
    [mindNode.id, setEditingNodeId]
  );

  const toggleFullMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullMode(v => !v);
    setTimeout(() => updateNodeInternals(mindNode.id), 0);
  }, [mindNode.id, updateNodeInternals]);

  const btnStyle: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--ms-border)",
    background: "var(--ms-border)",
    color: "var(--ms-text)",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 500,
  };

  const tabBtnStyle = (tab: TabType): React.CSSProperties => ({
    flex: 1,
    padding: "4px 0",
    background: activeTab === tab ? "var(--ms-accent)" : "transparent",
    border: "none",
    borderRadius: 5,
    color: activeTab === tab ? "var(--ms-bg)" : "var(--ms-text-muted)",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    transition: "background 0.12s",
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{
        width: mindNode.width,
        height: fullMode ? "auto" : mindNode.height,
        display: "flex",
        flexDirection: "column",
      }}
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        minWidth={180}
        minHeight={120}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, params) => {
          updateNode(mindNode.id, { width: params.width, height: params.height });
        }}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Clock size={14} color="var(--ms-accent)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Clock</span>
        <button
          onClick={toggleFullMode}
          title={fullMode ? "Collapse" : "Expand"}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
            color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0,
          }}
        >
          {fullMode ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          title="Delete"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 3,
          padding: "6px 10px 4px",
          background: "color-mix(in srgb, var(--ms-border) 40%, transparent)",
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(["clock", "stopwatch", "timer"] as TabType[]).map((tab) => (
          <button
            key={tab}
            style={tabBtnStyle(tab)}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab(tab);
            }}
          >
            {tab === "clock" ? "Clock" : tab === "stopwatch" ? "Stopwatch" : "Timer"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div
        className="ms-node-body"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          cursor: "default",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {activeTab === "clock" && (
          <>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: "var(--ms-text)",
                letterSpacing: 1,
              }}
            >
              {formatLiveTime(clockTime)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>
              {clockTime.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </div>
          </>
        )}

        {activeTab === "stopwatch" && (
          <>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: "var(--ms-text)",
                letterSpacing: 1,
              }}
            >
              {formatHMS(swElapsed, true)}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={btnStyle} onClick={handleSwStartStop}>
                {swRunning ? "Stop" : "Start"}
              </button>
              <button style={btnStyle} onClick={handleSwReset}>
                Reset
              </button>
            </div>
          </>
        )}

        {activeTab === "timer" && (
          <>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color:
                  timerRemaining === 0 && timerBaseRef.current > 0 ? "#f87171" : "var(--ms-text)",
                letterSpacing: 1,
              }}
            >
              {formatHMS(timerRemaining)}
            </div>

            {!timerRunning && timerRemaining === 0 && (
              <div
                style={{ display: "flex", gap: 6, alignItems: "center" }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={timerMinutes}
                  onChange={(e) =>
                    setTimerMinutes(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))
                  }
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 40,
                    background: "var(--ms-border)",
                    border: "1px solid var(--ms-border)",
                    borderRadius: 4,
                    color: "var(--ms-text)",
                    fontSize: 12,
                    padding: "2px 4px",
                    textAlign: "center",
                    userSelect: "text",
                    outline: "none",
                  }}
                />
                <span style={{ color: "var(--ms-text-muted)", fontSize: 12 }}>m</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={timerSeconds}
                  onChange={(e) =>
                    setTimerSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))
                  }
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 40,
                    background: "var(--ms-border)",
                    border: "1px solid var(--ms-border)",
                    borderRadius: 4,
                    color: "var(--ms-text)",
                    fontSize: 12,
                    padding: "2px 4px",
                    textAlign: "center",
                    userSelect: "text",
                    outline: "none",
                  }}
                />
                <span style={{ color: "var(--ms-text-muted)", fontSize: 12 }}>s</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 6 }}>
              <button style={btnStyle} onClick={handleTimerStartStop}>
                {timerRunning ? "Stop" : "Start"}
              </button>
              <button style={btnStyle} onClick={handleTimerReset}>
                Reset
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

export default ClockNode;
