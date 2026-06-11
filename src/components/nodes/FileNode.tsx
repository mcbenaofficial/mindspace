import React, { useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  BookOpen, FileText, Hash, File, Maximize2, Minimize2,
  Trash2, Upload, X, AlertCircle, Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCmdKey } from "../../hooks/useCmdKey";
import { useStore } from "../../store";
import { MindNode, FileData, FileDocType } from "../../types";

export type FileNodeType = Node<{ mindNode: MindNode }, "file">;

const MAX_CONTENT = 60_000;

const TYPE_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  pdf:  { label: "PDF",      color: "#ef4444", Icon: FileText },
  md:   { label: "Markdown", color: "#818cf8", Icon: Hash     },
  docx: { label: "Word",     color: "#3b82f6", Icon: FileText },
  txt:  { label: "Text",     color: "#6b7280", Icon: File     },
};

// ─── Parsers ──────────────────────────────────────────────────────────────────
async function parsePdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  const limit = Math.min(pdf.numPages, 100);
  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items
      .filter((it: any) => "str" in it)
      .map((it: any) => it.str)
      .join(" ");
    pages.push(text);
  }
  return pages.join("\n\n");
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const buffer = await file.arrayBuffer();
  const result = await (mammoth as any).extractRawText({ arrayBuffer: buffer });
  return result.value as string;
}

async function extractContent(file: File): Promise<{ content: string; truncated: boolean }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let raw = "";
  if (ext === "pdf") {
    raw = await parsePdf(file);
  } else if (ext === "docx") {
    raw = await parseDocx(file);
  } else {
    raw = await file.text();
  }
  const truncated = raw.length > MAX_CONTENT;
  return { content: raw.slice(0, MAX_CONTENT), truncated };
}

function wordCount(text: string): number {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function FileNode({ data, selected }: NodeProps<FileNodeType>) {
  const { mindNode } = data;
  const fileData = mindNode.data as FileData;
  const { updateNode, setEditingNodeId, deleteNode } = useStore();
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();

  const [fullMode, setFullMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasFile = !!fileData.fileName;
  const meta = fileData.fileType ? TYPE_META[fileData.fileType] : null;
  const words = wordCount(fileData.content);

  const toggleFullMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullMode(v => !v);
    setTimeout(() => updateNodeInternals(mindNode.id), 0);
  }, [mindNode.id, updateNodeInternals]);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["pdf", "md", "docx", "txt"];
    if (!allowed.includes(ext)) {
      setError(`Unsupported type ".${ext}". Use PDF, MD, DOCX, or TXT.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { content, truncated } = await extractContent(file);
      await updateNode(mindNode.id, {
        data: {
          ...fileData,
          fileName: file.name,
          fileType: ext as FileDocType,
          content,
          truncated,
        },
      });
    } catch (err) {
      setError(`Failed to parse: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [fileData, mindNode.id, updateNode]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const clearFile = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateNode(mindNode.id, {
      data: { ...fileData, fileName: "", fileType: "", content: "", truncated: false },
    });
    setError(null);
  }, [fileData, mindNode.id, updateNode]);

  const preview = fileData.content.slice(0, 320);
  const hasMore = fileData.content.length > 320;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: fullMode ? "auto" : mindNode.height, display: "flex", flexDirection: "column" }}
      onDoubleClick={e => { e.stopPropagation(); setEditingNodeId(mindNode.id); }}
    >
      <NodeResizer
        minWidth={220} minHeight={160} isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: meta ? meta.color : "var(--ms-accent)", flexShrink: 0, transition: "background 0.3s" }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0, gap: 7 }}>
        {meta
          ? <meta.Icon size={14} color={meta.color} />
          : <BookOpen size={14} color="var(--ms-accent)" />
        }
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hasFile ? fileData.fileName : "Document"}
        </span>
        {meta && (
          <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, background: `${meta.color}18`, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.06em", flexShrink: 0 }}>
            {meta.label}
          </span>
        )}
        {hasFile && (
          <button onClick={clearFile} title="Remove file" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}>
            <X size={12} />
          </button>
        )}
        <button onClick={toggleFullMode} title={fullMode ? "Collapse" : "Expand"} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}>
          {fullMode ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button onClick={e => { e.stopPropagation(); deleteNode(mindNode.id); }} title="Delete node" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}>
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <div className="nodrag nopan" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.docx,.txt"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />

        {!hasFile ? (
          /* ── Drop zone ── */
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={e => e.stopPropagation()}
            onClick={() => inputRef.current?.click()}
            style={{
              flex: 1, margin: 10, borderRadius: 12, cursor: "pointer",
              border: "1.5px dashed rgba(255,255,255,0.1)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 8, padding: 16,
              background: "rgba(0,0,0,0.12)",
              boxShadow: "inset -2px -2px 6px var(--nm-light), inset 2px 2px 6px var(--nm-dark)",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--ms-accent)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.1)"; }}
          >
            {loading ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                  <Loader2 size={26} color="var(--ms-accent)" />
                </motion.div>
                <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>Parsing file…</span>
              </>
            ) : (
              <>
                <Upload size={26} color="var(--ms-text-muted)" style={{ opacity: 0.45 }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ms-text)" }}>Attach a document</div>
                  <div style={{ fontSize: 10, color: "var(--ms-text-muted)", marginTop: 2 }}>PDF · Markdown · DOCX · TXT</div>
                </div>
                <div style={{ fontSize: 9, color: "var(--ms-text-muted)", letterSpacing: "0.06em" }}>CLICK OR DROP</div>
              </>
            )}
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#f87171", textAlign: "center", marginTop: 4 }}>
                <AlertCircle size={11} />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : loading ? (
          /* ── Re-parsing ── */
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Loader2 size={20} color="var(--ms-accent)" />
            </motion.div>
            <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>Parsing…</span>
          </div>
        ) : (
          /* ── Content ── */
          <>
            {/* Stats bar */}
            <div style={{ padding: "5px 12px 4px", display: "flex", gap: 10, alignItems: "center", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>{words.toLocaleString()} words</span>
              {fileData.truncated && (
                <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 600 }}>TRUNCATED</span>
              )}
              <button
                onClick={() => inputRef.current?.click()}
                style={{ marginLeft: "auto", fontSize: 10, color: "var(--ms-accent)", background: "none", border: "none", cursor: "pointer", padding: "1px 0" }}
              >
                Replace
              </button>
            </div>

            {/* Content area */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "8px 12px",
                userSelect: "text",
                minHeight: 0,
              }}
            >
              {fileData.fileType === "md" ? (
                <div className="ms-chat-md" style={{ fontSize: 11 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {fullMode ? fileData.content : preview + (hasMore ? "\n\n…" : "")}
                  </ReactMarkdown>
                </div>
              ) : (
                <pre style={{
                  fontSize: 10,
                  lineHeight: 1.6,
                  color: "var(--ms-text-muted)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                  fontFamily: "inherit",
                }}>
                  {fullMode ? fileData.content : preview}
                  {!fullMode && hasMore && (
                    <span style={{ color: "var(--ms-text-muted)", fontStyle: "italic" }}> …</span>
                  )}
                </pre>
              )}
            </div>

            {/* Connect hint */}
            <div style={{ padding: "4px 12px 6px", flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontSize: 9, color: "var(--ms-text-muted)", letterSpacing: "0.06em" }}>
                Connect to AI Chat to use as context
              </span>
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

export default FileNode;
