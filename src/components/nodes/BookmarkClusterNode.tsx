import { useCallback, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Bookmark, Trash2, Plus } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, BookmarkClusterData, BookmarkItem } from "../../types";
import { generateId } from "../../lib/db";

async function openUrl(url: string) {
  try {
    const { openUrl: _open } = await import("@tauri-apps/plugin-opener");
    await _open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type BookmarkClusterNodeType = Node<{ mindNode: MindNode }, "bookmark-cluster">;

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getSiteName(url: string, title: string): string {
  if (title) return title;
  const domain = getDomain(url);
  return domain.replace(/^www\./, "");
}

export function BookmarkClusterNode({ data, selected }: NodeProps<BookmarkClusterNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as BookmarkClusterData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [addingUrl, setAddingUrl] = useState("");
  const [addingTitle, setAddingTitle] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const columns = d.columns ?? 3;

  const setColumns = useCallback(
    (cols: number) => {
      updateNode(mindNode.id, { data: { ...d, columns: cols } });
    },
    [d, mindNode.id, updateNode]
  );

  const addBookmark = useCallback(() => {
    const url = addingUrl.trim();
    if (!url) return;
    const title = addingTitle.trim() || getSiteName(url, "");
    const newItem: BookmarkItem = { id: generateId(), url, title };
    updateNode(mindNode.id, { data: { ...d, bookmarks: [...(d.bookmarks ?? []), newItem] } });
    setAddingUrl("");
    setAddingTitle("");
    setShowAddForm(false);
  }, [addingUrl, addingTitle, d, mindNode.id, updateNode]);

  const deleteBookmark = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      updateNode(mindNode.id, { data: { ...d, bookmarks: d.bookmarks.filter((b) => b.id !== id) } });
    },
    [d, mindNode.id, updateNode]
  );

  const bookmarks = d.bookmarks ?? [];

  const colOptions = [2, 3, 4];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={220}
        minHeight={180}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: 3, background: "#f59e0b", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Bookmark size={14} color="#f59e0b" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>
          Bookmarks
          {bookmarks.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: "var(--ms-text-muted)" }}>
              {bookmarks.length}
            </span>
          )}
        </span>
        {/* Column toggles */}
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {colOptions.map((cols) => (
            <button
              key={cols}
              onClick={(e) => { e.stopPropagation(); setColumns(cols); }}
              title={`${cols} columns`}
              style={{
                background: columns === cols ? "#f59e0b22" : "none",
                border: columns === cols ? "1px solid #f59e0b66" : "1px solid transparent",
                borderRadius: 3,
                cursor: "pointer",
                padding: "1px 4px",
                color: columns === cols ? "#f59e0b" : "var(--ms-text-muted)",
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {cols}
            </button>
          ))}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setShowAddForm(s => !s); }}
          title="Add bookmark"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: showAddForm ? "#f59e0b" : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <Plus size={13} />
        </button>
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
      <div className="ms-node-body nodrag nopan" style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {bookmarks.length === 0 && !showAddForm && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 6 }}>
            <Bookmark size={24} color="var(--ms-text-muted)" />
            <span style={{ fontSize: 11, color: "var(--ms-text-muted)", textAlign: "center" }}>
              Click + to add a bookmark
            </span>
          </div>
        )}

        {bookmarks.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: 6,
            }}
          >
            {bookmarks.map((bm) => {
              const domain = getDomain(bm.url);
              const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
              return (
                <div
                  key={bm.id}
                  style={{ position: "relative" }}
                  onMouseEnter={() => setHoveredId(bm.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <button
                    onClick={() => openUrl(bm.url)}
                    title={bm.url}
                    style={{
                      width: "100%",
                      background: "var(--ms-surface)",
                      border: "1px solid var(--ms-border)",
                      borderRadius: 7,
                      cursor: "pointer",
                      padding: "8px 6px 6px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 5,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ms-border)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ms-surface)"; }}
                  >
                    <img
                      src={faviconUrl}
                      alt=""
                      width={20}
                      height={20}
                      style={{ borderRadius: 3, objectFit: "contain" }}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        img.style.display = "none";
                        const fallback = img.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <div
                      style={{
                        display: "none",
                        width: 20,
                        height: 20,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Bookmark size={14} color="#f59e0b" />
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        color: "var(--ms-text)",
                        textAlign: "center",
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.3,
                        fontWeight: 500,
                      }}
                    >
                      {bm.title || getSiteName(bm.url, "")}
                    </span>
                    <span
                      style={{
                        fontSize: 8,
                        color: "var(--ms-text-muted)",
                        textAlign: "center",
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {domain.replace(/^www\./, "")}
                    </span>
                  </button>
                  {hoveredId === bm.id && (
                    <button
                      onClick={(e) => deleteBookmark(bm.id, e)}
                      title="Remove bookmark"
                      style={{
                        position: "absolute",
                        top: -5,
                        right: -5,
                        background: "#f87171",
                        border: "2px solid var(--ms-bg)",
                        borderRadius: "50%",
                        width: 16,
                        height: 16,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        color: "#fff",
                        zIndex: 10,
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div
          className="nodrag nopan"
          style={{ padding: "8px 10px", borderTop: "1px solid var(--ms-border)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 5 }}
        >
          <input
            value={addingUrl}
            onChange={(e) => setAddingUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addBookmark(); if (e.key === "Escape") setShowAddForm(false); }}
            placeholder="https://..."
            autoFocus
            style={{ background: "var(--ms-bg)", border: "1px solid var(--ms-border)", borderRadius: 5, color: "var(--ms-text)", fontSize: 11, padding: "4px 8px", outline: "none" }}
          />
          <input
            value={addingTitle}
            onChange={(e) => setAddingTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addBookmark(); if (e.key === "Escape") setShowAddForm(false); }}
            placeholder="Title (optional)"
            style={{ background: "var(--ms-bg)", border: "1px solid var(--ms-border)", borderRadius: 5, color: "var(--ms-text)", fontSize: 11, padding: "4px 8px", outline: "none" }}
          />
          <div style={{ display: "flex", gap: 5 }}>
            <button
              onClick={addBookmark}
              style={{ flex: 1, background: "#f59e0b", border: "none", borderRadius: 4, color: "#000", fontSize: 11, fontWeight: 700, padding: "4px 0", cursor: "pointer" }}
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              style={{ background: "var(--ms-surface)", border: "1px solid var(--ms-border)", borderRadius: 4, color: "var(--ms-text-muted)", fontSize: 11, padding: "4px 10px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default BookmarkClusterNode;
