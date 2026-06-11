import { useCallback, useState, useRef } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Columns2, Trash2, Plus, X } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, KanbanData, KanbanCard } from "../../types";
import { generateId } from "../../lib/db";

export type KanbanNodeType = Node<{ mindNode: MindNode }, "kanban">;

export function KanbanNode({ data, selected }: NodeProps<KanbanNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as KanbanData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  // Per-column: whether add-input is showing
  const [addingCol, setAddingCol] = useState<string | null>(null);
  const [addText, setAddText] = useState("");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const dragRef = useRef<{ cardId: string; fromColumnId: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const addCard = useCallback(
    (colId: string) => {
      if (!addText.trim()) { setAddingCol(null); return; }
      const card: KanbanCard = { id: generateId(), text: addText.trim() };
      const columns = d.columns.map((col) =>
        col.id === colId ? { ...col, cards: [...col.cards, card] } : col
      );
      updateNode(mindNode.id, { data: { ...d, columns } });
      setAddText("");
      setAddingCol(null);
    },
    [d, mindNode.id, updateNode, addText]
  );

  const deleteCard = useCallback(
    (colId: string, cardId: string) => {
      const columns = d.columns.map((col) =>
        col.id === colId ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) } : col
      );
      updateNode(mindNode.id, { data: { ...d, columns } });
    },
    [d, mindNode.id, updateNode]
  );

  const moveCard = useCallback(
    (cardId: string, fromColId: string, toColId: string) => {
      if (fromColId === toColId) return;
      let movingCard: KanbanCard | undefined;
      const columns = d.columns.map((col) => {
        if (col.id === fromColId) {
          const card = col.cards.find((c) => c.id === cardId);
          movingCard = card;
          return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
        }
        return col;
      });
      const finalCols = columns.map((col) => {
        if (col.id === toColId && movingCard) {
          return { ...col, cards: [...col.cards, movingCard] };
        }
        return col;
      });
      updateNode(mindNode.id, { data: { ...d, columns: finalCols } });
    },
    [d, mindNode.id, updateNode]
  );

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
        minHeight={200}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Columns2 size={14} color="var(--ms-accent)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Kanban</span>
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

      {/* Columns */}
      <div
        className="ms-node-body nodrag nopan"
        style={{ flex: 1, overflow: "hidden", display: "flex", gap: 0, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {d.columns.map((col, colIdx) => (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(col.id); }}
            onDragLeave={(e) => { e.stopPropagation(); setDragOver(null); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(null);
              if (dragRef.current) {
                moveCard(dragRef.current.cardId, dragRef.current.fromColumnId, col.id);
                dragRef.current = null;
              }
            }}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderRight: colIdx < d.columns.length - 1 ? "1px solid var(--ms-border)" : undefined,
              background: dragOver === col.id ? "color-mix(in srgb, var(--ms-accent) 6%, transparent)" : "transparent",
              transition: "background 0.1s",
              minWidth: 0,
            }}
          >
            {/* Column header */}
            <div style={{ padding: "6px 8px 4px", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, borderBottom: "1px solid var(--ms-border)" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ms-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {col.title}
              </span>
              <span style={{ fontSize: 9, background: "var(--ms-border)", color: "var(--ms-text-muted)", borderRadius: 8, padding: "1px 5px", fontWeight: 600 }}>
                {col.cards.length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 5px", display: "flex", flexDirection: "column", gap: 4 }}>
              {col.cards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    dragRef.current = { cardId: card.id, fromColumnId: col.id };
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={(e) => { e.stopPropagation(); dragRef.current = null; }}
                  onMouseEnter={() => setHoveredCard(card.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    background: "var(--ms-surface)",
                    border: "1px solid var(--ms-border)",
                    borderRadius: 5,
                    padding: "5px 7px",
                    fontSize: 11,
                    color: "var(--ms-text)",
                    cursor: "grab",
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 5,
                    userSelect: "none",
                  }}
                >
                  {card.color && (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: card.color, flexShrink: 0, marginTop: 3 }} />
                  )}
                  <span style={{ flex: 1, wordBreak: "break-word" }}>{card.text}</span>
                  {hoveredCard === card.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCard(col.id, card.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add card */}
            <div style={{ padding: "4px 5px 6px", flexShrink: 0 }}>
              {addingCol === col.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <textarea
                    autoFocus
                    value={addText}
                    onChange={(e) => setAddText(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCard(col.id); }
                      if (e.key === "Escape") { setAddingCol(null); setAddText(""); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Card text..."
                    rows={2}
                    style={{ width: "100%", background: "var(--ms-surface)", border: "1px solid var(--ms-accent)", borderRadius: 5, color: "var(--ms-text)", fontSize: 11, padding: "4px 6px", outline: "none", resize: "none", boxSizing: "border-box", userSelect: "text" }}
                  />
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button onClick={(e) => { e.stopPropagation(); setAddingCol(null); setAddText(""); }} style={{ background: "none", border: "none", fontSize: 10, color: "var(--ms-text-muted)", cursor: "pointer", padding: "2px 4px" }}>
                      Cancel
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); addCard(col.id); }} style={{ background: "var(--ms-accent)", border: "none", borderRadius: 4, fontSize: 10, color: "#fff", fontWeight: 600, cursor: "pointer", padding: "2px 8px" }}>
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setAddingCol(col.id); setAddText(""); }}
                  style={{ width: "100%", background: "none", border: "1px dashed var(--ms-border)", borderRadius: 5, color: "var(--ms-text-muted)", fontSize: 10, cursor: "pointer", padding: "4px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ms-accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-accent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ms-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
                >
                  <Plus size={10} /> Add card
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default KanbanNode;
