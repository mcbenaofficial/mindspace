import React, { useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { useCmdKey } from '../../hooks/useCmdKey';
import { motion } from "framer-motion";
import { format } from "date-fns";
import { FileText, Maximize2, Minimize2, Trash2, Download } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, NoteData } from "../../types";
import { useModelSuggestions, ModelSuggestionChips } from "../canvas/ModelSuggestionChips";

function tiptapToMarkdown(jsonStr: string, title: string): string {
  let md = `# ${title}\n\n`;
  if (!jsonStr) return md;
  try {
    const doc = JSON.parse(jsonStr);

    function applyMarks(text: string, marks?: { type: string; attrs?: Record<string, string> }[]): string {
      if (!marks) return text;
      for (const m of marks) {
        if (m.type === "bold") text = `**${text}**`;
        else if (m.type === "italic") text = `*${text}*`;
        else if (m.type === "code") text = `\`${text}\``;
        else if (m.type === "strike") text = `~~${text}~~`;
        else if (m.type === "link") text = `[${text}](${m.attrs?.href ?? ""})`;
      }
      return text;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function render(node: any): string {
      switch (node.type) {
        case "doc":
          return (node.content ?? []).map(render).join("\n");
        case "paragraph":
          return (node.content ?? []).map(render).join("") + "\n";
        case "heading": {
          const hashes = "#".repeat(node.attrs?.level ?? 1);
          return `${hashes} ${(node.content ?? []).map(render).join("")}\n`;
        }
        case "text":
          return applyMarks(node.text ?? "", node.marks);
        case "hardBreak":
          return "\n";
        case "horizontalRule":
          return "\n---\n";
        case "bulletList":
          return (node.content ?? []).map((item: any) => `- ${(item.content ?? []).map(render).join("").trim()}`).join("\n") + "\n";
        case "orderedList":
          return (node.content ?? []).map((item: any, i: number) => `${i + 1}. ${(item.content ?? []).map(render).join("").trim()}`).join("\n") + "\n";
        case "listItem":
          return (node.content ?? []).map(render).join("");
        case "blockquote":
          return (node.content ?? []).map(render).join("").split("\n").map((l: string) => `> ${l}`).join("\n") + "\n";
        case "codeBlock": {
          const lang = node.attrs?.language ?? "";
          const code = (node.content ?? []).map(render).join("");
          return `\`\`\`${lang}\n${code}\n\`\`\`\n`;
        }
        default:
          return (node.content ?? []).map(render).join("");
      }
    }

    md += render(doc);
  } catch {
    md += jsonStr;
  }
  return md;
}

export type NoteNodeType = Node<{ mindNode: MindNode }, "note">;

export function NoteNode({ data, selected }: NodeProps<NoteNodeType>) {
  const { mindNode } = data;
  const noteData = mindNode.data as NoteData;
  const { updateNode, setEditingNodeId, deleteNode } = useStore();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(noteData.title);
  const [fullMode, setFullMode] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();

  const saveTitle = useCallback(() => {
    setEditingTitle(false);
    if (titleValue !== noteData.title) {
      updateNode(mindNode.id, {
        data: { ...noteData, title: titleValue },
      });
    }
  }, [titleValue, noteData, mindNode.id, updateNode]);

  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitle(true);
    setTimeout(() => titleRef.current?.select(), 0);
  }, []);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        saveTitle();
      }
    },
    [saveTitle]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNodeId(mindNode.id);
    },
    [mindNode.id, setEditingNodeId]
  );

  const downloadNote = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const md = tiptapToMarkdown(noteData.content, noteData.title || "note");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${noteData.title || "note"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [noteData]);

  const toggleFullMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullMode(v => !v);
    setTimeout(() => updateNodeInternals(mindNode.id), 0);
  }, [mindNode.id, updateNodeInternals]);

  const contentPreview = React.useMemo(() => {
    if (!noteData.content) return "";
    try {
      const parsed = JSON.parse(noteData.content);
      const extract = (node: any): string => {
        if (node.type === "text") return node.text || "";
        if (node.content) return node.content.map(extract).join(" ");
        return "";
      };
      return extract(parsed);
    } catch {
      return noteData.content;
    }
  }, [noteData.content]);

  const createdDate = React.useMemo(() => {
    try {
      return format(new Date(mindNode.created_at), "MMM d, yyyy");
    } catch {
      return "";
    }
  }, [mindNode.created_at]);

  const sugg = useModelSuggestions(mindNode.id, `${titleValue} ${contentPreview}`, !!selected);

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
        <FileText size={14} color="var(--ms-accent)" />
        {editingTitle ? (
          <input
            ref={titleRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={handleTitleKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--ms-text)",
              fontSize: 13,
              fontWeight: 600,
              userSelect: "text",
              cursor: "text",
            }}
          />
        ) : (
          <span
            onClick={handleTitleClick}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ms-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "text",
              userSelect: "text",
            }}
          >
            {noteData.title || "Untitled"}
          </span>
        )}
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

      {/* Body */}
      <div
        className="ms-node-body"
        style={{ flex: 1, overflow: "hidden", cursor: "default" }}
      >
        <p
          style={{
            fontSize: 12,
            color: "var(--ms-text-muted)",
            lineHeight: 1.55,
            margin: 0,
            ...(fullMode
              ? { overflow: "visible" }
              : {
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }),
            userSelect: "text",
          }}
        >
          {contentPreview || (
            <span style={{ fontStyle: "italic", opacity: 0.6 }}>Double-click to edit…</span>
          )}
        </p>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "4px 12px 6px",
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>{createdDate}</span>
        <button
          onClick={downloadNote}
          title="Download as .md"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Download size={10} />
        </button>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <ModelSuggestionChips sourceNode={mindNode} models={sugg.models} onDismiss={sugg.dismiss} onClear={sugg.clear} />
    </motion.div>
  );
}

export default NoteNode;
