import { useCallback, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Hash, Trash2, Pencil, Eye } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, MarkdownData } from "../../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type MarkdownNodeType = Node<{ mindNode: MindNode }, "markdown">;

const ACCENT = "#84cc16";

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function MarkdownNode({ data, selected }: NodeProps<MarkdownNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as MarkdownData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(d.content);

  const save = useCallback(
    (content: string) => {
      updateNode(mindNode.id, { data: { ...d, content } });
    },
    [d, mindNode.id, updateNode]
  );

  const handleBlur = () => {
    save(draft);
  };

  const wordCount = countWords(d.content);

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

      <div style={{ height: 3, background: ACCENT, flexShrink: 0 }} />

      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Hash size={14} color={ACCENT} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Markdown</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (editMode) {
              save(draft);
            } else {
              setDraft(d.content);
            }
            setEditMode((v) => !v);
          }}
          title={editMode ? "Preview" : "Edit"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: editMode ? ACCENT : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          {editMode ? <Eye size={12} /> : <Pencil size={12} />}
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

      <div
        className="ms-node-body nodrag nopan"
        style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        {editMode ? (
          <textarea
            className="nodrag nopan"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            placeholder="Write markdown here…"
            spellCheck={false}
            style={{
              flex: 1,
              background: "var(--ms-bg)",
              color: "var(--ms-text)",
              border: "none",
              outline: "none",
              resize: "none",
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.6,
              padding: "10px 12px",
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "10px 14px",
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--ms-text)",
            }}
          >
            {d.content.trim() ? (
              <div
                style={{
                  color: "var(--ms-text)",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "var(--ms-text)", borderBottom: "1px solid var(--ms-border)", paddingBottom: 4 }}>{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "10px 0 6px", color: "var(--ms-text)" }}>{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 style={{ fontSize: 13, fontWeight: 700, margin: "8px 0 4px", color: "var(--ms-text)" }}>{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p style={{ margin: "0 0 8px", color: "var(--ms-text)" }}>{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul style={{ margin: "0 0 8px", paddingLeft: 20, color: "var(--ms-text)" }}>{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol style={{ margin: "0 0 8px", paddingLeft: 20, color: "var(--ms-text)" }}>{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li style={{ marginBottom: 2, color: "var(--ms-text)" }}>{children}</li>
                    ),
                    code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode; className?: string }) =>
                      inline ? (
                        <code
                          {...props}
                          style={{
                            background: "var(--ms-bg)",
                            border: "1px solid var(--ms-border)",
                            borderRadius: 3,
                            padding: "1px 4px",
                            fontFamily: "monospace",
                            fontSize: 11,
                            color: ACCENT,
                          }}
                        >
                          {children}
                        </code>
                      ) : (
                        <code
                          {...props}
                          style={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            color: "var(--ms-text)",
                            display: "block",
                          }}
                        >
                          {children}
                        </code>
                      ),
                    pre: ({ children }) => (
                      <pre
                        style={{
                          background: "var(--ms-bg)",
                          border: "1px solid var(--ms-border)",
                          borderRadius: 5,
                          padding: "8px 10px",
                          overflowX: "auto",
                          margin: "0 0 8px",
                          fontFamily: "monospace",
                          fontSize: 11,
                          lineHeight: 1.5,
                        }}
                      >
                        {children}
                      </pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote
                        style={{
                          borderLeft: `3px solid ${ACCENT}`,
                          paddingLeft: 10,
                          margin: "0 0 8px",
                          color: "var(--ms-text-muted)",
                          fontStyle: "italic",
                        }}
                      >
                        {children}
                      </blockquote>
                    ),
                    a: ({ children, href }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: ACCENT, textDecoration: "underline" }}
                      >
                        {children}
                      </a>
                    ),
                    strong: ({ children }) => (
                      <strong style={{ fontWeight: 700, color: "var(--ms-text)" }}>{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em style={{ fontStyle: "italic", color: "var(--ms-text)" }}>{children}</em>
                    ),
                    hr: () => (
                      <hr style={{ border: "none", borderTop: "1px solid var(--ms-border)", margin: "8px 0" }} />
                    ),
                    table: ({ children }) => (
                      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 8, fontSize: 12 }}>{children}</table>
                    ),
                    th: ({ children }) => (
                      <th style={{ border: "1px solid var(--ms-border)", padding: "4px 8px", background: "var(--ms-bg)", fontWeight: 700, textAlign: "left" }}>{children}</th>
                    ),
                    td: ({ children }) => (
                      <td style={{ border: "1px solid var(--ms-border)", padding: "4px 8px" }}>{children}</td>
                    ),
                  }}
                >
                  {d.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div style={{ color: "var(--ms-text-muted)", fontStyle: "italic", fontSize: 12 }}>
                Click the edit button to start writing…
              </div>
            )}
          </div>
        )}

        <div
          style={{
            flexShrink: 0,
            borderTop: "1px solid var(--ms-border)",
            padding: "3px 10px",
            display: "flex",
            justifyContent: "flex-end",
            background: "var(--ms-bg)",
          }}
        >
          <span style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </span>
        </div>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default MarkdownNode;
