import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, FileText, Bot, CheckSquare, Mic, Globe, StickyNote, Code2, Layers } from "lucide-react";
import { useStore } from "../../store";
import { searchNodes, SearchResult } from "../../lib/search";
import { sounds } from "../../lib/sound";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  note: <FileText size={13} />,
  "sticky-note": <StickyNote size={13} />,
  "ai-chat": <Bot size={13} />,
  task: <CheckSquare size={13} />,
  voice: <Mic size={13} />,
  stt: <Mic size={13} />,
  "web-link": <Globe size={13} />,
  "code-snippet": <Code2 size={13} />,
};

export function SearchPalette() {
  const { setSearchOpen, setPendingFocusNodeId, loadCanvases, setActiveCanvas } = useStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchNodes(query);
        setResults(r);
        setSelectedIdx(0);
      } catch (err) {
        console.warn("Search failed:", err);
        setResults([]);
      }
    }, 120);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const jumpTo = useCallback(async (r: SearchResult) => {
    const s = useStore.getState();
    sounds.click();
    setSearchOpen(false);
    setPendingFocusNodeId(r.nodeId);
    if (r.projectId && r.projectId !== s.activeProjectId) {
      await loadCanvases(r.projectId);
    }
    if (r.canvasId !== useStore.getState().activeCanvasId) {
      setActiveCanvas(r.canvasId);
    }
  }, [setSearchOpen, setPendingFocusNodeId, loadCanvases, setActiveCanvas]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setSearchOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results[selectedIdx]) { e.preventDefault(); jumpTo(results[selectedIdx]); }
  }, [results, selectedIdx, jumpTo, setSearchOpen]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={() => setSearchOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "16vh",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 90vw)", maxHeight: "56vh",
          background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
          borderRadius: 14, boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
        onKeyDown={onKeyDown}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--ms-border)" }}>
          <Search size={15} color="var(--ms-text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every node in every project…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--ms-text)", fontSize: 15, fontFamily: "inherit",
            }}
          />
          <kbd style={{ fontSize: 10, color: "var(--ms-text-muted)", border: "1px solid var(--ms-border)", borderRadius: 4, padding: "2px 6px" }}>esc</kbd>
        </div>

        <div className="nowheel" style={{ overflowY: "auto", flex: 1, padding: 6 }}>
          {query.trim() && results.length === 0 && (
            <div style={{ padding: "18px 14px", fontSize: 12.5, color: "var(--ms-text-muted)", textAlign: "center" }}>
              No matches
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={r.nodeId}
              onClick={() => jumpTo(r)}
              onMouseEnter={() => setSelectedIdx(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                background: i === selectedIdx ? "var(--ms-accent-15)" : "transparent",
                border: i === selectedIdx ? "1px solid var(--ms-accent-25)" : "1px solid transparent",
              }}
            >
              <span style={{ color: "var(--ms-accent)", display: "flex", flexShrink: 0 }}>
                {TYPE_ICONS[r.type] ?? <Layers size={13} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title}
                </div>
                {r.snippet && (
                  <div style={{ fontSize: 11, color: "var(--ms-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.snippet}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, color: "var(--ms-text-muted)", flexShrink: 0 }}>
                {r.projectName}{r.canvasName ? ` / ${r.canvasName}` : ""}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
