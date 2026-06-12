import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { MentalModel, MentalModelCategory, CATEGORY_LABELS, getAllModels } from "../lib/mentalModels";

// Dropdown for picking a mental-model lens on an AI Chat node. Grouped by
// primary category, searchable across all of them, keyboard navigable.

interface LensPickerProps {
  value: MentalModel | null;
  onChange: (model: MentalModel | null) => void;
  onClose: () => void;
}

const CATEGORY_ORDER: MentalModelCategory[] = ["management", "career", "thinking"];

export default function LensPicker({ value, onChange, onClose }: LensPickerProps) {
  const [models, setModels] = useState<MentalModel[]>([]);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllModels().then(setModels).catch(err => console.warn("LensPicker: failed to load models:", err));
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(m =>
      m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
    );
  }, [models, query]);

  // Flat list in render order (grouped by category, alphabetical within) so
  // arrow keys walk exactly what is on screen.
  const groups = useMemo(() =>
    CATEGORY_ORDER
      .map(cat => ({
        cat,
        items: filtered
          .filter(m => m.category === cat)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter(g => g.items.length > 0),
    [filtered]);
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);

  useEffect(() => { setHighlight(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[highlight]) onChange(flat[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    e.stopPropagation();
  };

  let idx = -1;
  return (
    <div
      ref={rootRef}
      className="nodrag nopan nowheel"
      onClick={e => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      style={{
        width: 280, maxHeight: 320, display: "flex", flexDirection: "column",
        background: "var(--ms-surface-2)", border: "1px solid var(--ms-border-2)",
        borderRadius: 8, boxShadow: "var(--ms-shadow-md)", overflow: "hidden",
      }}>
      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--ms-border)", flexShrink: 0 }}>
        <Search size={12} color="var(--ms-text-muted)" style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search mental models…"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--ms-text)", fontSize: 12, userSelect: "text", cursor: "text" }}
        />
      </div>

      {/* Grouped list */}
      <div ref={listRef} style={{ overflowY: "auto", padding: "4px 0" }}>
        {flat.length === 0 && (
          <div style={{ padding: "14px 12px", fontSize: 12, color: "var(--ms-text-muted)" }}>
            {models.length === 0 ? "Loading models…" : "No models match."}
          </div>
        )}
        {groups.map(g => (
          <div key={g.cat}>
            <div style={{ padding: "6px 12px 3px", fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--ms-text-muted)" }}>
              {CATEGORY_LABELS[g.cat]}
            </div>
            {g.items.map(m => {
              idx += 1;
              const i = idx;
              const isHighlighted = i === highlight;
              const isActive = value?.id === m.id;
              return (
                <div
                  key={m.id}
                  data-idx={i}
                  onClick={() => onChange(m)}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    padding: "5px 12px", cursor: "pointer",
                    background: isHighlighted ? "var(--ms-accent-15)" : "none",
                    borderLeft: isActive ? "2px solid #EF9F27" : "2px solid transparent",
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: isActive ? "#EF9F27" : "var(--ms-text)" }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: "var(--ms-text-muted)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {m.description}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
