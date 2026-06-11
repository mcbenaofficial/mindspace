import { useCallback, useState, useRef } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Code2, Trash2, Pencil, Eye, Copy, Check } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, CodeSnippetData } from "../../types";

export type CodeSnippetNodeType = Node<{ mindNode: MindNode }, "code-snippet">;

const ACCENT = "#6366f1";

const LANGUAGES = [
  "typescript", "javascript", "python", "rust", "css", "html", "json", "bash", "sql", "other",
];

const KEYWORDS: Record<string, string[]> = {
  typescript: ["if","else","for","while","return","function","const","let","var","class","import","export","type","interface","extends","implements","new","this","true","false","null","undefined","void","async","await","try","catch","finally","throw","typeof","instanceof","switch","case","break","continue","default","from","of","in","as","enum"],
  javascript: ["if","else","for","while","return","function","const","let","var","class","import","export","new","this","true","false","null","undefined","void","async","await","try","catch","finally","throw","typeof","instanceof","switch","case","break","continue","default","from","of","in","as"],
  python: ["if","else","elif","for","while","return","def","class","import","from","as","with","pass","break","continue","raise","try","except","finally","True","False","None","and","or","not","in","is","lambda","yield","global","nonlocal"],
  rust: ["fn","let","mut","if","else","for","while","loop","return","struct","impl","trait","use","mod","pub","crate","self","super","match","enum","type","const","static","async","await","move","ref","in","where","true","false","break","continue"],
  css: ["background","color","display","flex","grid","width","height","margin","padding","border","font","text","position","top","left","right","bottom","overflow","opacity","transform","transition","animation","cursor","z-index","align","justify"],
  html: ["html","head","body","div","span","p","a","img","ul","ol","li","table","tr","td","th","form","input","button","select","option","script","style","link","meta","title","h1","h2","h3","h4","h5","h6","section","article","nav","header","footer","main","aside"],
  json: [],
  bash: ["if","then","else","elif","fi","for","while","do","done","case","esac","function","return","export","local","echo","cd","ls","grep","awk","sed","cat","mkdir","rm","cp","mv","chmod","chown","sudo","apt","brew","npm","git"],
  sql: ["SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","OUTER","ON","GROUP","BY","ORDER","HAVING","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","DROP","ALTER","INDEX","VIEW","AS","AND","OR","NOT","IN","IS","NULL","LIKE","BETWEEN","DISTINCT","COUNT","SUM","AVG","MAX","MIN"],
  other: ["if","else","for","while","return","function","class","import","export","const","let","var"],
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightCode(code: string, lang: string): string {
  const escaped = escapeHtml(code);
  const kws = KEYWORDS[lang] ?? KEYWORDS.other;

  // We process token by token to avoid nested replacements
  // Strategy: replace in order - comments, strings, then keywords, numbers
  let result = escaped;

  // Comments: // line comment
  result = result.replace(
    /(\/\/[^\n]*)/g,
    `<span style="color:var(--ms-text-muted);font-style:italic">$1</span>`
  );

  // Block comments /* ... */
  result = result.replace(
    /(\/\*[\s\S]*?\*\/)/g,
    `<span style="color:var(--ms-text-muted);font-style:italic">$1</span>`
  );

  // Python # comments (only if python/bash)
  if (lang === "python" || lang === "bash") {
    result = result.replace(
      /(#[^\n]*)/g,
      `<span style="color:var(--ms-text-muted);font-style:italic">$1</span>`
    );
  }

  // Strings: double quotes, single quotes, template literals (basic)
  result = result.replace(
    /(&quot;(?:[^&]|&(?!quot;))*?&quot;|'[^'\n]*?'|`[^`]*?`)/g,
    `<span style="color:#86efac">$1</span>`
  );

  // Numbers
  result = result.replace(
    /\b(\d+\.?\d*)\b/g,
    `<span style="color:#fcd34d">$1</span>`
  );

  // Keywords
  if (kws.length > 0) {
    const kwPattern = new RegExp(`\\b(${kws.join("|")})\\b`, "g");
    result = result.replace(
      kwPattern,
      `<span style="color:${ACCENT}">$1</span>`
    );
  }

  return result;
}

export function CodeSnippetNode({ data, selected }: NodeProps<CodeSnippetNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as CodeSnippetData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [editMode, setEditMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const save = useCallback(
    (field: Partial<CodeSnippetData>) => {
      updateNode(mindNode.id, { data: { ...d, ...field } });
    },
    [d, mindNode.id, updateNode]
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(d.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [d.code]);

  const lineCount = d.code.split("\n").length;

  // Build line numbers for edit mode
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");

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

      <div className="ms-node-header" style={{ flexShrink: 0, gap: 4 }}>
        <Code2 size={14} color={ACCENT} />
        <input
          className="nodrag nopan"
          value={d.title}
          onChange={(e) => save({ title: e.target.value })}
          placeholder="Snippet title"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ms-text)",
            minWidth: 0,
          }}
        />
        <select
          className="nodrag nopan"
          value={d.language}
          onChange={(e) => save({ language: e.target.value })}
          style={{
            background: "var(--ms-bg)",
            border: "1px solid var(--ms-border)",
            borderRadius: 4,
            color: "var(--ms-text-muted)",
            fontSize: 10,
            padding: "2px 4px",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <button
          onClick={(e) => { e.stopPropagation(); setEditMode((v) => !v); }}
          title={editMode ? "Preview" : "Edit"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: editMode ? ACCENT : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          {editMode ? <Eye size={12} /> : <Pencil size={12} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          title="Copy code"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: copied ? "#86efac" : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
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
        style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
      >
        {editMode ? (
          /* Edit mode: textarea with line numbers */
          <div style={{ flex: 1, display: "flex", overflow: "hidden", fontFamily: "monospace", fontSize: 12 }}>
            <div
              style={{
                userSelect: "none",
                background: "var(--ms-bg)",
                color: "var(--ms-text-muted)",
                textAlign: "right",
                padding: "10px 6px 10px 4px",
                lineHeight: "1.5",
                fontSize: 11,
                minWidth: 32,
                overflow: "hidden",
                whiteSpace: "pre",
                borderRight: "1px solid var(--ms-border)",
              }}
            >
              {lineNumbers}
            </div>
            <textarea
              ref={textareaRef}
              className="nodrag nopan"
              value={d.code}
              onChange={(e) => save({ code: e.target.value })}
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
                lineHeight: 1.5,
                padding: "10px 8px",
                tabSize: 2,
              }}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const ta = e.currentTarget;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const newVal = ta.value.substring(0, start) + "  " + ta.value.substring(end);
                  save({ code: newVal });
                  requestAnimationFrame(() => {
                    ta.selectionStart = start + 2;
                    ta.selectionEnd = start + 2;
                  });
                }
              }}
            />
          </div>
        ) : (
          /* View mode: syntax highlighted */
          <div style={{ flex: 1, overflow: "auto" }}>
            <pre
              style={{
                margin: 0,
                padding: "10px 12px",
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--ms-text)",
                whiteSpace: "pre",
                overflowX: "auto",
              }}
            >
              <code
                dangerouslySetInnerHTML={{ __html: highlightCode(d.code, d.language) }}
              />
            </pre>
          </div>
        )}

        {/* Footer */}
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
            {lineCount} {lineCount === 1 ? "line" : "lines"}
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

export default CodeSnippetNode;
