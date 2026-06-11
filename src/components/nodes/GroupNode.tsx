import { useCallback, useRef, useState } from "react";
import { NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Trash2, Ungroup } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, GroupData } from "../../types";

export type GroupNodeType = Node<{ mindNode: MindNode }, "group">;

const COLOR_PRESETS = [
  { label: "None",    bg: "",        border: "var(--ms-border)" },
  { label: "Blue",    bg: "#3b82f620", border: "#3b82f6" },
  { label: "Purple",  bg: "#8b5cf620", border: "#8b5cf6" },
  { label: "Green",   bg: "#10b98120", border: "#10b981" },
  { label: "Amber",   bg: "#f59e0b20", border: "#f59e0b" },
  { label: "Rose",    bg: "#f4366520", border: "#f43665" },
  { label: "Cyan",    bg: "#06b6d420", border: "#06b6d4" },
];

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  const { mindNode } = data;
  const groupData = mindNode.data as GroupData;
  const { updateNode, deleteNode, nodes } = useStore();
  const cmdDown = useCmdKey();
  const labelRef = useRef<HTMLInputElement>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(groupData.label);

  const children = nodes.filter((n) => n.parent_id === mindNode.id);

  const preset = COLOR_PRESETS.find((p) => p.border === groupData.color) ?? COLOR_PRESETS[0];
  const bgColor = preset.bg || "color-mix(in srgb, var(--ms-accent) 4%, transparent)";
  const borderColor = preset.border;

  const commitLabel = useCallback(() => {
    const label = labelDraft.trim() || "Group";
    updateNode(mindNode.id, { data: { ...groupData, label } });
    setEditingLabel(false);
  }, [labelDraft, groupData, mindNode.id, updateNode]);

  const ungroup = useCallback(() => {
    children.forEach((child) => {
      updateNode(child.id, { parent_id: null });
    });
    deleteNode(mindNode.id);
  }, [children, mindNode.id, updateNode, deleteNode]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      style={{
        width: mindNode.width,
        height: mindNode.height,
        position: "relative",
        background: bgColor,
        border: `1.5px ${selected ? "solid" : "dashed"} ${borderColor}`,
        borderRadius: 12,
        boxSizing: "border-box",
        pointerEvents: "all",
      }}
    >
      {/* Always show resize handles for groups */}
      <NodeResizer
        minWidth={120}
        minHeight={80}
        isVisible={true}
        lineStyle={{ borderColor, borderWidth: 1, opacity: 0.6 }}
        handleStyle={{ background: borderColor, border: "2px solid var(--ms-bg)", width: 10, height: 10, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Label bar */}
      <div
        style={{
          position: "absolute",
          top: -28,
          left: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 26,
          paddingLeft: 6,
          paddingRight: 4,
          background: borderColor === "var(--ms-border)" ? "var(--ms-surface)" : borderColor,
          borderRadius: "6px 6px 0 0",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        {editingLabel ? (
          <input
            ref={labelRef}
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") commitLabel();
            }}
            onBlur={commitLabel}
            className="nodrag nopan"
            style={{
              background: "none",
              border: "none",
              outline: "none",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              width: 100,
              caretColor: "#fff",
            }}
          />
        ) : (
          <span
            onDoubleClick={() => { setLabelDraft(groupData.label); setEditingLabel(true); }}
            style={{ fontSize: 11, fontWeight: 600, color: "#fff", cursor: "text", whiteSpace: "nowrap", userSelect: "none" }}
          >
            {groupData.label}
          </span>
        )}

        {children.length > 0 && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>
            {children.length}
          </span>
        )}

        {/* Color picker dots — always visible */}
        {selected && (
          <div style={{ display: "flex", gap: 3, marginLeft: 2 }} className="nodrag nopan">
            {COLOR_PRESETS.map((p) => (
              <button
                key={p.label}
                title={p.label}
                onClick={(e) => {
                  e.stopPropagation();
                  updateNode(mindNode.id, { data: { ...groupData, color: p.border } });
                }}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  border: groupData.color === p.border ? "2px solid #fff" : "1px solid rgba(255,255,255,0.4)",
                  background: p.bg || "rgba(255,255,255,0.15)",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* CMD overlay: ungroup + delete */}
      {cmdDown && (
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            gap: 4,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); ungroup(); }}
            title="Ungroup"
            style={{ background: "var(--ms-surface)", border: "1px solid var(--ms-border)", borderRadius: 5, padding: "3px 6px", cursor: "pointer", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-accent)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
          >
            <Ungroup size={12} /> Ungroup
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
            title="Delete group (keeps nodes)"
            style={{ background: "var(--ms-surface)", border: "1px solid var(--ms-border)", borderRadius: 5, padding: "3px 6px", cursor: "pointer", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default GroupNode;
