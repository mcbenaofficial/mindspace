import { useCallback, useRef } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, StickyNoteData } from "../../types";

export type StickyNoteNodeType = Node<{ mindNode: MindNode }, "sticky-note">;

const COLOR_MAP: Record<string, string> = {
  yellow: "#fef08a",
  orange: "#fdba74",
  pink: "#f9a8d4",
  green: "#86efac",
  blue: "#93c5fd",
  purple: "#c4b5fd",
};

const COLOR_KEYS = Object.keys(COLOR_MAP) as (keyof typeof COLOR_MAP)[];

// Slightly darker shades for text to stay readable
const TEXT_COLOR_MAP: Record<string, string> = {
  yellow: "#713f12",
  orange: "#7c2d12",
  pink: "#831843",
  green: "#14532d",
  blue: "#1e3a5f",
  purple: "#3b0764",
};

export function StickyNoteNode({ data, selected }: NodeProps<StickyNoteNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as StickyNoteData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const bg = COLOR_MAP[d.color] ?? COLOR_MAP.yellow;
  const textColor = TEXT_COLOR_MAP[d.color] ?? TEXT_COLOR_MAP.yellow;

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNode(mindNode.id, { data: { ...d, content: e.target.value } });
    },
    [mindNode.id, d, updateNode]
  );

  const handleColorChange = useCallback(
    (colorKey: string, e: React.MouseEvent) => {
      e.stopPropagation();
      updateNode(mindNode.id, { data: { ...d, color: colorKey } });
    },
    [mindNode.id, d, updateNode]
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      style={{
        width: mindNode.width,
        height: mindNode.height,
        background: bg,
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        boxShadow: selected
          ? `0 0 0 2px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.18)`
          : `0 2px 8px rgba(0,0,0,0.13)`,
        transition: "box-shadow 0.15s",
      }}
    >
      <NodeResizer
        minWidth={120}
        minHeight={100}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "rgba(0,0,0,0.25)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "rgba(0,0,0,0.35)", border: "2px solid rgba(255,255,255,0.5)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Top-right controls row */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          alignItems: "center",
          gap: 4,
          zIndex: 10,
        }}
      >
        {/* Color dots — visible when selected */}
        {selected && (
          <div
            className="nodrag nopan"
            style={{ display: "flex", gap: 4, alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            {COLOR_KEYS.map((key) => (
              <button
                key={key}
                onClick={(e) => handleColorChange(key, e)}
                title={key}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: COLOR_MAP[key],
                  border: d.color === key ? "2px solid rgba(0,0,0,0.4)" : "2px solid rgba(0,0,0,0.12)",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                  transition: "transform 0.1s",
                  transform: d.color === key ? "scale(1.2)" : "scale(1)",
                }}
              />
            ))}
          </div>
        )}

        {/* Delete button — always visible */}
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{
            background: "rgba(0,0,0,0.1)",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            color: textColor,
            display: "flex",
            alignItems: "center",
            borderRadius: 4,
            opacity: 0.7,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; (e.currentTarget as HTMLButtonElement).style.color = "#991b1b"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; (e.currentTarget as HTMLButtonElement).style.color = textColor; }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Textarea — full body */}
      <textarea
        ref={textareaRef}
        className="nodrag nopan"
        value={d.content}
        onChange={handleContentChange}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="Write something…"
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          fontSize: 14,
          lineHeight: 1.6,
          color: textColor,
          fontFamily: "inherit",
          cursor: "text",
          userSelect: "text",
          paddingTop: 20, // leave room for top-right controls
          width: "100%",
        }}
      />

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default StickyNoteNode;
