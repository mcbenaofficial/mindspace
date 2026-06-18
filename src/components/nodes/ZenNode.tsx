import React, { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  Waves, Play, Pause, SlidersHorizontal, Trash2, Save, X,
} from "lucide-react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { useStore } from "../../store";
import { MindNode, ZenNodeData, ZenVariation, ZenScale, ZenTone } from "../../types";
import { createNodeAudio, ZenNodeAudio } from "../../lib/audio/zenAudio";
import {
  createVariation, VARIATION_ORDER, VARIATION_LABELS, MELODIC,
} from "../../lib/zen/variations";
import type { ZenVariationModule, ZenEnv } from "../../lib/zen/variations";
import { notifyZenSessionCompleted } from "../../lib/rules/engine";

export type ZenNodeType = Node<{ mindNode: MindNode }, "zen">;

const ACCENT = "#38bdf8"; // calm cyan accent for the Zen node

// ─── Theme colour resolution (cached; CSS vars read off :root) ────────────────
function luminance(color: string): number {
  const m = color.match(/(\d+\.?\d*)/g);
  if (!m || m.length < 3) {
    // #rrggbb fallback
    const hex = color.replace("#", "");
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return 0.1;
  }
  const [r, g, b] = m.map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function resolveColors() {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue("--ms-accent").trim() || ACCENT;
  const fg = cs.getPropertyValue("--ms-text").trim() || "#e5e7eb";
  const bg = cs.getPropertyValue("--ms-surface").trim() || cs.getPropertyValue("--ms-bg").trim() || "#0b0e14";
  return { accent, fg, bg, dark: luminance(bg) < 0.5 };
}

function fmtMMSS(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const TIMER_PRESETS: (number | null)[] = [null, 10, 25, 45];

export function ZenNode({ data, selected }: NodeProps<ZenNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as ZenNodeData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [playing, setPlaying] = useState(false);
  const [showTuning, setShowTuning] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [phaseText, setPhaseText] = useState("");
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<ZenNodeAudio | null>(null);
  const varRef = useRef<ZenVariationModule | null>(null);
  const varNameRef = useRef<ZenVariation>(d.variation);
  const audioReadyRef = useRef(false);
  const visibleRef = useRef(true);
  const playingRef = useRef(false);
  const dataRef = useRef<ZenNodeData>(d);
  const frameCountRef = useRef(0);
  const colorsRef = useRef(resolveColors());
  const colorTick = useRef(0);
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const sessionEndRef = useRef<number | null>(null);

  useEffect(() => { dataRef.current = d; }, [d]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Persist a partial settings change.
  const update = useCallback(
    (partial: Partial<ZenNodeData>) => {
      updateNode(mindNode.id, { data: { ...dataRef.current, ...partial } });
    },
    [mindNode.id, updateNode],
  );

  // Build the env handed to the active variation each step.
  const buildEnv = useCallback((): ZenEnv => {
    return {
      audio: audioRef.current!,
      settings: dataRef.current,
      accent: colorsRef.current.accent,
      fg: colorsRef.current.fg,
      bg: colorsRef.current.bg,
      dark: colorsRef.current.dark,
      reducedMotion: reducedMotion.current,
    };
  }, []);

  // (Re)create the active variation module.
  const initVariation = useCallback((v: ZenVariation) => {
    const audio = audioRef.current;
    if (audio && varRef.current) {
      try { varRef.current.dispose(buildEnv()); } catch { /* noop */ }
    }
    varNameRef.current = v;
    varRef.current = createVariation(v);
    const canvas = canvasRef.current;
    const W = canvas?.width || 360;
    const H = canvas?.height || 400;
    if (audioRef.current) varRef.current.init(buildEnv(), W, H);
  }, [buildEnv]);

  // Apply all live audio params from current data.
  const applyAudioParams = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.setVolume(d.volume);
    a.setSpace(d.space);
    a.setChimeLevel(d.chimeLevel);
    a.setTone(d.tone);
    a.setScale(d.scale, d.rootShift);
  }, [d.volume, d.space, d.chimeLevel, d.tone, d.scale, d.rootShift]);

  useEffect(() => { applyAudioParams(); }, [applyAudioParams]);

  // ── Canvas sizing ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const resize = () => {
      canvas.width = parent.offsetWidth || 360;
      canvas.height = parent.offsetHeight || 400;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // ── Offscreen detection (pause rendering, keep audio) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const io = new IntersectionObserver(
      ([entry]) => { visibleRef.current = entry.isIntersecting; },
      { threshold: 0 },
    );
    io.observe(canvas);
    return () => io.disconnect();
  }, []);

  // ── The driver loop ──
  // Visible → requestAnimationFrame (step + draw). Offscreen + playing →
  // setInterval (step only, audio keeps scheduling). Variation is created
  // lazily once audio exists; before first play we still render a paused frame.
  useEffect(() => {
    let raf = 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    let last = performance.now();

    const stepOnce = (draw: boolean) => {
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1; // clamp tab-switch jumps

      // Refresh theme colours ~2x/sec.
      colorTick.current += dt;
      if (colorTick.current > 0.5) {
        colorsRef.current = resolveColors();
        colorTick.current = 0;
      }

      const canvas = canvasRef.current;
      if (!varRef.current && audioRef.current) initVariation(varNameRef.current);
      const mod = varRef.current;

      // Session timer.
      if (sessionEndRef.current != null && playingRef.current) {
        const rem = (sessionEndRef.current - Date.now()) / 1000;
        setRemaining(rem > 0 ? rem : 0);
        if (rem <= 20 && rem > 0) {
          audioRef.current?.setVolume(dataRef.current.volume * (rem / 20));
        }
        if (rem <= 0) finishSession();
      }

      if (mod && canvas) {
        const ctx = draw ? canvas.getContext("2d") : null;
        mod.step(dt, ctx, buildEnv(), canvas.width, canvas.height);
        if (draw) frameCountRef.current++;
        if (mod.phaseText) setPhaseText(mod.phaseText());
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return; // tab inactive: rely on the interval below
      if (visibleRef.current) stepOnce(true);
    };

    // Visible rendering via RAF (runs whenever the node is mounted & visible,
    // playing or not, so a freshly dropped node animates immediately).
    raf = requestAnimationFrame(loop);

    // Offscreen / hidden audio keep-alive: only needed while playing.
    interval = setInterval(() => {
      if (!playingRef.current) return;
      if (!visibleRef.current || document.hidden) stepOnce(false);
    }, 25);

    return () => {
      cancelAnimationFrame(raf);
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Variation switching ──
  useEffect(() => {
    if (varNameRef.current === d.variation) return;
    audioRef.current?.duckVoices(0.5);
    initVariation(d.variation);
    applyAudioParams();
  }, [d.variation, initVariation, applyAudioParams]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      try { if (audioRef.current) varRef.current?.dispose(buildEnv()); } catch { /* noop */ }
      audioRef.current?.dispose();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Play / pause ──
  const finishSession = useCallback(() => {
    sessionEndRef.current = null;
    setRemaining(null);
    audioRef.current?.pause();
    setPlaying(false);
    audioRef.current?.setVolume(dataRef.current.volume); // restore after fade
    notifyZenSessionCompleted({
      nodeId: mindNode.id,
      canvasId: mindNode.canvas_id,
      variation: dataRef.current.variation,
      durationMinutes: dataRef.current.timerMinutes ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindNode.id, mindNode.canvas_id]);

  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) {
      audioRef.current?.pause();
      sessionEndRef.current = null;
      setRemaining(null);
      setPlaying(false);
      return;
    }
    // Start: create handle on the gesture, build graph, (re)init variation.
    if (!audioRef.current) audioRef.current = createNodeAudio();
    const firstStart = !audioReadyRef.current;
    audioRef.current.start();
    applyAudioParams();
    if (firstStart) {
      audioReadyRef.current = true;
      initVariation(varNameRef.current);
    }
    if (dataRef.current.timerMinutes != null) {
      sessionEndRef.current = Date.now() + dataRef.current.timerMinutes * 60_000;
    }
    setPlaying(true);
  }, [playing, applyAudioParams, initVariation]);

  // ── Preset save / recall ──
  const savePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    const { presets: _omit, ...settings } = dataRef.current;
    const preset = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, settings };
    update({ presets: [...dataRef.current.presets, preset] });
    setPresetName("");
    setSavingPreset(false);
  }, [presetName, update]);

  const recallPreset = useCallback((id: string) => {
    const p = dataRef.current.presets.find((x) => x.id === id);
    if (!p) return;
    update({ ...p.settings, presets: dataRef.current.presets });
  }, [update]);

  const deletePreset = useCallback((id: string) => {
    update({ presets: dataRef.current.presets.filter((x) => x.id !== id) });
  }, [update]);

  // ── Render ──
  const melodic = MELODIC[d.variation];
  const showDensity = d.variation !== "breath" && d.variation !== "ocean";
  const showSpeed = d.variation !== "breath";
  const showAmbience = d.variation === "rain" || d.variation === "ocean";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={320}
        minHeight={420}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: 3, background: ACCENT, flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <Waves size={14} color={ACCENT} />
        <select
          className="nodrag nopan"
          value={d.variation}
          onChange={(e) => update({ variation: e.target.value as ZenVariation })}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, background: "transparent", border: "none", color: "var(--ms-text)",
            fontSize: 14, fontWeight: 500, outline: "none", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {VARIATION_ORDER.map((v) => (
            <option key={v} value={v}>{VARIATION_LABELS[v]}</option>
          ))}
        </select>
        {remaining != null && (
          <span style={{ fontSize: 11, color: ACCENT, fontVariantNumeric: "tabular-nums" }}>
            {fmtMMSS(remaining)} left
          </span>
        )}
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); setShowTuning((v) => !v); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: showTuning ? ACCENT : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          title="Tuning"
        >
          <SlidersHorizontal size={12} />
        </button>
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Canvas body */}
      <div style={{ position: "relative", flex: 1, minHeight: 120, overflow: "hidden" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
        {/* aria-live phase text for Breathing Orb */}
        {d.variation === "breath" && (
          <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            {phaseText}
          </div>
        )}
      </div>

      {/* Control strip */}
      <div className="ms-node-body nodrag nopan" style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handlePlayPause}
            style={{ background: ACCENT, border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#04121a", flexShrink: 0 }}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <Slider label="Volume" min={0} max={1} step={0.01} value={d.volume} onChange={(v) => update({ volume: v })} />
        </div>

        {showTuning && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, borderTop: "1px solid var(--ms-border)", paddingTop: 8 }}>
            {showSpeed && <Slider label="Speed" min={0.3} max={1.6} step={0.05} value={d.speed} onChange={(v) => update({ speed: v })} fmt={(v) => `${v.toFixed(2)}x`} />}
            {showDensity && <Slider label="Density" min={4} max={ d.variation === "fireflies" ? 25 : 14} step={1} value={d.density} onChange={(v) => update({ density: v })} fmt={(v) => String(Math.round(v))} />}
            <Slider label="Space" min={0} max={0.7} step={0.01} value={d.space} onChange={(v) => update({ space: v })} />
            {melodic && (
              <>
                <Slider label="Chime" min={0} max={1} step={0.01} value={d.chimeLevel} onChange={(v) => update({ chimeLevel: v })} />
                <Row label="Scale">
                  <Select value={d.scale} onChange={(v) => update({ scale: v as ZenScale })} options={[["maj_penta", "C Major Pentatonic"], ["min_penta", "A Minor Pentatonic"], ["hirajoshi", "Hirajoshi"]]} />
                </Row>
                <Row label="Root">
                  <Select value={String(d.rootShift)} onChange={(v) => update({ rootShift: Number(v) as -1 | 0 | 1 })} options={[["-1", "Low (-1 oct)"], ["0", "Mid"], ["1", "High (+1 oct)"]]} />
                </Row>
                <Row label="Tone">
                  <Select value={d.tone} onChange={(v) => update({ tone: v as ZenTone })} options={[["sine", "Sine"], ["triangle", "Triangle"], ["kalimba", "Kalimba"]]} />
                </Row>
              </>
            )}
            {showAmbience && <Slider label="Ambience" min={0} max={1} step={0.01} value={d.ambienceLevel} onChange={(v) => update({ ambienceLevel: v })} />}
            {d.variation === "fireflies" && <Slider label="Chime chance" min={0} max={1} step={0.01} value={d.chimeProbability} onChange={(v) => update({ chimeProbability: v })} />}
            {d.variation === "breath" && (
              <>
                <Row label="Cycle">
                  <Select value={d.breathPreset} onChange={(v) => update({ breathPreset: v as "478" | "box" })} options={[["478", "4-7-8"], ["box", "Box (4-4-4-4)"]]} />
                </Row>
                <Row label="Pad">
                  <button onClick={() => update({ padOn: !d.padOn })} style={{ ...pillStyle, background: d.padOn ? ACCENT : "var(--ms-border)", color: d.padOn ? "#04121a" : "var(--ms-text-muted)" }}>{d.padOn ? "On" : "Off"}</button>
                </Row>
              </>
            )}
            {d.variation === "ocean" && (
              <>
                <Slider label="Swell period" min={4} max={16} step={0.5} value={d.swellPeriod} onChange={(v) => update({ swellPeriod: v })} fmt={(v) => `${v.toFixed(1)}s`} />
                <Slider label="Intensity" min={0} max={1} step={0.01} value={d.intensity} onChange={(v) => update({ intensity: v })} />
              </>
            )}

            {/* Session timer */}
            <Row label="Timer">
              <div style={{ display: "flex", gap: 4 }}>
                {TIMER_PRESETS.map((m) => (
                  <button
                    key={String(m)}
                    onClick={() => update({ timerMinutes: m })}
                    style={{ ...pillStyle, flex: 1, background: d.timerMinutes === m ? ACCENT : "var(--ms-border)", color: d.timerMinutes === m ? "#04121a" : "var(--ms-text-muted)" }}
                  >
                    {m == null ? "Off" : `${m}m`}
                  </button>
                ))}
              </div>
            </Row>

            {/* Presets */}
            <Row label="Presets">
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                {d.presets.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {d.presets.map((p) => (
                      <span key={p.id} style={{ display: "flex", alignItems: "center", gap: 3, background: "var(--ms-border)", borderRadius: 6, padding: "2px 4px 2px 7px", fontSize: 10.5 }}>
                        <button onClick={() => recallPreset(p.id)} style={{ background: "none", border: "none", color: "var(--ms-text)", cursor: "pointer", fontSize: 10.5, fontFamily: "inherit" }} title="Recall">{p.name}</button>
                        <button onClick={() => deletePreset(p.id)} style={{ background: "none", border: "none", color: "var(--ms-text-muted)", cursor: "pointer", display: "flex" }} title="Delete"><X size={9} /></button>
                      </span>
                    ))}
                  </div>
                )}
                {savingPreset ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <input
                      autoFocus value={presetName} onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") savePreset(); if (e.key === "Escape") setSavingPreset(false); }}
                      placeholder="Preset name"
                      style={{ flex: 1, background: "var(--ms-bg)", border: "1px solid var(--ms-border)", borderRadius: 6, padding: "4px 6px", color: "var(--ms-text)", fontSize: 11, outline: "none", fontFamily: "inherit" }}
                    />
                    <button onClick={savePreset} style={{ ...pillStyle, background: ACCENT, color: "#04121a" }}><Save size={11} /></button>
                  </div>
                ) : (
                  <button onClick={() => setSavingPreset(true)} style={{ ...pillStyle, display: "flex", alignItems: "center", gap: 4, justifyContent: "center", color: "var(--ms-text-muted)", background: "var(--ms-border)" }}>
                    <Save size={11} /> Save current
                  </button>
                )}
              </div>
            </Row>
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

// ─── Small control primitives ─────────────────────────────────────────────────

const pillStyle: React.CSSProperties = {
  border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 10.5,
  cursor: "pointer", fontFamily: "inherit", color: "var(--ms-text)",
  background: "var(--ms-border)", display: "flex", alignItems: "center", justifyContent: "center",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10.5, color: "var(--ms-text-muted)", width: 70, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, fmt }: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10.5, color: "var(--ms-text-muted)", width: 70, flexShrink: 0 }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        style={{ flex: 1, accentColor: ACCENT, height: 4, cursor: "pointer" }}
      />
      <span style={{ fontSize: 10, color: "var(--ms-text-muted)", width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {fmt ? fmt(value) : `${Math.round(value * 100)}%`}
      </span>
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", background: "var(--ms-bg)", border: "1px solid var(--ms-border)", borderRadius: 6, padding: "4px 6px", color: "var(--ms-text)", fontSize: 11, outline: "none", fontFamily: "inherit", cursor: "pointer" }}
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export default ZenNode;
