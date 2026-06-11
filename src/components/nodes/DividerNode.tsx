import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Trash2, X } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, DividerData } from "../../types";

export type DividerNodeType = Node<{ mindNode: MindNode }, "divider">;

// ── Color palettes ─────────────────────────────────────────────────────────────

const FILL_PRESETS = [
  "#1e1e2e", "#2d2d3f", "#1a2035",
  "#1a2e22", "#2e1a1a", "#2e2a1a",
  "#f0f0ff", "#f0fff4",
];

const LINE_PRESETS = [
  "",         // accent
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#64748b",
];

// ── Fill style renderer ────────────────────────────────────────────────────────

function getFillStyle(
  effect: DividerData["effect"],
  fillColor: string,
  isH: boolean
): React.CSSProperties {
  if (!fillColor) return {};
  const c = fillColor;

  switch (effect) {
    case "solid":
      return { background: c };

    case "gradient":
      return {
        background: isH
          ? `linear-gradient(to right, transparent, ${c} 20%, ${c} 80%, transparent)`
          : `linear-gradient(to bottom, transparent, ${c} 20%, ${c} 80%, transparent)`,
      };

    case "striped":
      return {
        background: `repeating-linear-gradient(
          45deg,
          ${c},
          ${c} 6px,
          color-mix(in srgb, ${c} 40%, transparent) 6px,
          color-mix(in srgb, ${c} 40%, transparent) 14px
        )`,
      };

    case "dotted":
      return {
        backgroundImage: `radial-gradient(circle, ${c} 2px, transparent 2px)`,
        backgroundSize: "12px 12px",
      };

    case "double": {
      const dir = isH ? "to bottom" : "to right";
      return {
        background: `linear-gradient(
          ${dir},
          ${c} 3px,
          color-mix(in srgb, ${c} 15%, transparent) 3px,
          color-mix(in srgb, ${c} 15%, transparent) calc(100% - 3px),
          ${c} calc(100% - 3px)
        )`,
      };
    }

    default:
      return { background: c };
  }
}

// ── Panel helpers ──────────────────────────────────────────────────────────────

const panelInput: React.CSSProperties = {
  width: "100%",
  background: "var(--ms-bg)",
  border: "1px solid var(--ms-border)",
  borderRadius: 5,
  color: "var(--ms-text)",
  fontSize: 11,
  padding: "4px 7px",
  outline: "none",
  boxSizing: "border-box",
};

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ms-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 600,
              background: active ? "color-mix(in srgb, var(--ms-accent) 18%, transparent)" : "transparent",
              color: active ? "var(--ms-accent)" : "var(--ms-text-muted)",
              border: `1px solid ${active ? "var(--ms-accent)" : "var(--ms-border)"}`,
              borderRadius: 5,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DividerNode({ data }: NodeProps<DividerNodeType>) {
  const { mindNode } = data;
  const dd = mindNode.data as DividerData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [showProps, setShowProps] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(dd.label);
  const labelRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (patch: Partial<DividerData>) =>
      updateNode(mindNode.id, { data: { ...dd, ...patch } }),
    [dd, mindNode.id, updateNode]
  );

  // Close panel on outside click or Escape
  useEffect(() => {
    if (!showProps) return;
    const onPointer = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as globalThis.Node)) {
        setShowProps(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowProps(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [showProps]);

  const saveLabel = useCallback(() => {
    setEditingLabel(false);
    if (labelDraft !== dd.label) update({ label: labelDraft });
  }, [labelDraft, dd.label, update]);

  const switchOrientation = useCallback(() => {
    const next = dd.orientation === "horizontal" ? "vertical" : "horizontal";
    updateNode(mindNode.id, {
      width: mindNode.height,
      height: mindNode.width,
      data: { ...dd, orientation: next },
    });
  }, [dd, mindNode, updateNode]);

  const isH = dd.orientation === "horizontal";
  const resolvedAccent = dd.color || "var(--ms-accent)";
  const sectionThickness = isH ? mindNode.height : mindNode.width;

  const fillStyle = getFillStyle(dd.effect, dd.fillColor, isH);

  // ── Label element ────────────────────────────────────────────────────────────
  const labelEl = dd.showLabel && (
    editingLabel ? (
      <input
        ref={labelRef}
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        onBlur={saveLabel}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") saveLabel(); }}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        className="nodrag nopan"
        style={{
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${resolvedAccent}`,
          outline: "none",
          color: "var(--ms-text)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          maxWidth: isH ? 200 : 14,
          minWidth: 40,
          writingMode: isH ? "horizontal-tb" : "vertical-rl",
        }}
      />
    ) : (
      <span
        onDoubleClick={(e) => {
          e.stopPropagation();
          setLabelDraft(dd.label);
          setEditingLabel(true);
          setTimeout(() => labelRef.current?.select(), 0);
        }}
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ms-text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          flexShrink: 0,
          cursor: "default",
          whiteSpace: "nowrap",
          writingMode: isH ? "horizontal-tb" : "vertical-rl",
          transform: isH ? undefined : "rotate(180deg)",
          padding: "0 6px",
          mixBlendMode: "normal",
        }}
      >
        {dd.label || "Section"}
      </span>
    )
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      style={{
        width: mindNode.width,
        height: mindNode.height,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent:
          dd.labelPosition === "start" ? "flex-start"
          : dd.labelPosition === "end" ? "flex-end"
          : "center",
        userSelect: "none",
      }}
    >
      {/* Fill layer — clipped separately so controls above aren't hidden */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 6,
          overflow: "hidden",
          pointerEvents: "none",
          ...fillStyle,
        }}
      />

      <NodeResizer
        minWidth={isH ? 80 : 20}
        minHeight={isH ? 20 : 80}
        isVisible={cmdDown}
        lineStyle={{ borderColor: resolvedAccent, opacity: 0.5 }}
        handleStyle={{ background: resolvedAccent, border: "2px solid var(--ms-bg)", width: 8, height: 8, borderRadius: 2 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent dot + label */}
      <div style={{ display: "flex", flexDirection: isH ? "row" : "column", alignItems: "center", gap: 6, padding: isH ? "0 10px" : "10px 0", flexShrink: 0 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: resolvedAccent, flexShrink: 0, opacity: 0.9 }} />
        {labelEl}
      </div>

      {/* Floating controls (Cmd held) */}
      {cmdDown && (
        <div
          style={{
            position: "absolute",
            ...(isH ? { top: -30, right: 0 } : { left: "calc(100% + 4px)", top: 0 }),
            display: "flex",
            flexDirection: isH ? "row" : "column",
            gap: 4,
            zIndex: 10,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowProps((v) => !v); }}
            title="Properties"
            style={{
              background: showProps ? "var(--ms-accent)" : "var(--ms-surface)",
              border: `1px solid ${showProps ? "var(--ms-accent)" : "var(--ms-border)"}`,
              borderRadius: 5,
              cursor: "pointer",
              padding: "3px 6px",
              color: showProps ? "#fff" : "var(--ms-text-muted)",
              display: "flex",
              alignItems: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
            }}
          >
            <Settings size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
            style={{
              background: "var(--ms-surface)",
              border: "1px solid var(--ms-border)",
              borderRadius: 5,
              cursor: "pointer",
              padding: "3px 6px",
              color: "var(--ms-text-muted)",
              display: "flex",
              alignItems: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#f87171"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ms-border)"; }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* Properties panel */}
      <AnimatePresence>
        {showProps && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            ref={panelRef}
            className="nodrag nopan"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              ...(isH
                ? { bottom: "calc(100% + 36px)", right: 0 }
                : { left: "calc(100% + 36px)", top: 0 }),
              width: 232,
              background: "var(--ms-surface)",
              border: "1px solid var(--ms-border)",
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
              padding: 14,
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {/* Title + close */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--ms-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Divider Properties
              </span>
              <button
                onClick={() => setShowProps(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Label */}
            <PropRow label="Label">
              <input
                value={dd.label}
                onChange={(e) => update({ label: e.target.value })}
                style={panelInput}
                placeholder="Section name…"
              />
            </PropRow>

            {/* Show label toggle */}
            <PropRow label="Show label">
              <div style={{ display: "flex", gap: 4 }}>
                {([true, false] as const).map((v) => {
                  const active = dd.showLabel === v;
                  return (
                    <button
                      key={String(v)}
                      onClick={() => update({ showLabel: v })}
                      style={{
                        flex: 1,
                        padding: "3px 0",
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        background: active ? "var(--ms-accent)" : "transparent",
                        color: active ? "#fff" : "var(--ms-text-muted)",
                        border: `1px solid ${active ? "var(--ms-accent)" : "var(--ms-border)"}`,
                        borderRadius: 5,
                        cursor: "pointer",
                      }}
                    >
                      {v ? "Visible" : "Hidden"}
                    </button>
                  );
                })}
              </div>
            </PropRow>

            {/* Label position */}
            {dd.showLabel && (
              <PropRow label="Label position">
                <ChipGroup
                  options={["start", "center", "end"] as const}
                  value={dd.labelPosition}
                  onChange={(v) => update({ labelPosition: v })}
                />
              </PropRow>
            )}

            {/* Orientation */}
            <PropRow label="Orientation">
              <div style={{ display: "flex", gap: 4 }}>
                {(["horizontal", "vertical"] as const).map((o) => {
                  const active = dd.orientation === o;
                  return (
                    <button
                      key={o}
                      onClick={() => { if (!active) switchOrientation(); }}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        background: active ? "var(--ms-accent)" : "transparent",
                        color: active ? "#fff" : "var(--ms-text-muted)",
                        border: `1px solid ${active ? "var(--ms-accent)" : "var(--ms-border)"}`,
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      {o === "horizontal" ? "— H" : "| V"}
                    </button>
                  );
                })}
              </div>
            </PropRow>

            {/* Fill style */}
            <PropRow label="Fill style">
              <ChipGroup
                options={["solid", "gradient", "striped", "dotted", "double"] as const}
                value={dd.effect}
                onChange={(v) => update({ effect: v })}
              />
            </PropRow>

            {/* Section thickness */}
            <PropRow label={`Thickness — ${sectionThickness}px`}>
              <input
                type="range"
                min={20}
                max={160}
                step={4}
                value={sectionThickness}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateNode(mindNode.id, isH ? { height: val } : { width: val });
                }}
                className="nodrag nopan"
                onPointerDown={(e) => e.stopPropagation()}
                style={{ width: "100%", accentColor: resolvedAccent }}
              />
            </PropRow>

            {/* Fill color */}
            <PropRow label="Fill color">
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {/* Transparent swatch */}
                <button
                  onClick={() => update({ fillColor: "" })}
                  title="No fill"
                  style={{
                    width: 20, height: 20, borderRadius: "50%", padding: 0,
                    background: "transparent",
                    border: dd.fillColor === "" ? "2.5px solid var(--ms-text)" : "2px solid var(--ms-border)",
                    cursor: "pointer", flexShrink: 0, position: "relative", overflow: "hidden",
                  }}
                >
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom right, transparent calc(50% - 1px), #f87171 calc(50% - 1px), #f87171 calc(50% + 1px), transparent calc(50% + 1px))" }} />
                </button>
                {FILL_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => update({ fillColor: c })}
                    title={c}
                    style={{
                      width: 20, height: 20, borderRadius: "50%", padding: 0,
                      background: c,
                      border: dd.fillColor === c ? "2.5px solid var(--ms-text)" : "2px solid transparent",
                      outline: dd.fillColor === c ? "1px solid var(--ms-surface)" : "none",
                      cursor: "pointer", flexShrink: 0,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={dd.fillColor || "#1e1e2e"}
                  onChange={(e) => update({ fillColor: e.target.value })}
                  title="Custom fill"
                  className="nodrag nopan"
                  style={{ width: 24, height: 24, padding: 1, border: "1px solid var(--ms-border)", borderRadius: 5, cursor: "pointer", background: "transparent" }}
                />
              </div>
            </PropRow>

            {/* Accent / dot color */}
            <PropRow label="Accent color">
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {LINE_PRESETS.map((c) => (
                  <button
                    key={c || "__accent__"}
                    onClick={() => update({ color: c })}
                    title={c || "Theme accent"}
                    style={{
                      width: 20, height: 20, borderRadius: "50%", padding: 0,
                      background: c || "var(--ms-accent)",
                      border: dd.color === c ? "2.5px solid var(--ms-text)" : "2px solid transparent",
                      outline: dd.color === c ? "1px solid var(--ms-surface)" : "none",
                      cursor: "pointer", flexShrink: 0,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={dd.color || "#6366f1"}
                  onChange={(e) => update({ color: e.target.value })}
                  title="Custom accent"
                  className="nodrag nopan"
                  style={{ width: 24, height: 24, padding: 1, border: "1px solid var(--ms-border)", borderRadius: 5, cursor: "pointer", background: "transparent" }}
                />
              </div>
            </PropRow>
          </motion.div>
        )}
      </AnimatePresence>

      <Handle type="target" position={Position.Left} style={{ opacity: 0.3 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0.3 }} />
      {isH && (
        <>
          <Handle type="target" position={Position.Top} style={{ opacity: 0.3 }} />
          <Handle type="source" position={Position.Bottom} style={{ opacity: 0.3 }} />
        </>
      )}
    </motion.div>
  );
}

export default DividerNode;
