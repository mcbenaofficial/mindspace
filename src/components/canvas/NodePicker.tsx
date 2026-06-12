import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { NodeType } from "../../types";
import { CATEGORIES, nodeOptionsForCategory } from "../nodes/registry";
import type { NodeCategory } from "../nodes/registry";

interface NodePickerProps {
  position: { x: number; y: number };
  onSelect: (type: NodeType) => void;
  onClose: () => void;
}

export const NodePicker: React.FC<NodePickerProps> = ({ position, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<NodeCategory>("create");

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const PICKER_WIDTH = 240;
  const PICKER_HEIGHT = 340;
  const x = Math.min(position.x, window.innerWidth - PICKER_WIDTH - 8);
  const y = Math.min(position.y, window.innerHeight - PICKER_HEIGHT - 8);

  const visible = nodeOptionsForCategory(activeTab);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.90, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.90, y: -6 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "fixed", left: x, top: y,
        zIndex: 9999, width: PICKER_WIDTH,
        background: "rgba(13,16,40,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 16,
        boxShadow: "0 8px 48px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.05)",
        padding: 10,
        userSelect: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Category tabs */}
      <div style={{
        display: "flex", gap: 2, marginBottom: 10,
        background: "rgba(0,0,0,0.30)",
        borderRadius: 10, padding: 3,
        border: "1px solid rgba(255,255,255,0.05)",
      }}>
        {CATEGORIES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              flex: 1,
              padding: "5px 0",
              border: "none",
              borderRadius: 7,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: activeTab === id
                ? "linear-gradient(135deg, var(--ms-accent-15), rgba(255,255,255,0.06))"
                : "transparent",
              color: activeTab === id ? "var(--ms-accent)" : "var(--ms-text-muted)",
              boxShadow: activeTab === id
                ? "0 0 0 1px var(--ms-accent-15), 0 2px 6px rgba(0,0,0,0.3)"
                : "none",
              letterSpacing: "0.02em",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Node grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
        {visible.map(({ type, def }, i) => (
          <motion.button
            key={type}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.1, delay: i * 0.016 }}
            onClick={() => { onSelect(type); onClose(); }}
            style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 6,
              padding: "11px 6px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10,
              color: "var(--ms-text-muted)",
              cursor: "pointer",
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.01em",
              transition: "all 0.12s ease",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "var(--ms-accent-15)";
              el.style.borderColor = "var(--ms-accent-25)";
              el.style.color = "var(--ms-text)";
              el.style.transform = "translateY(-1px)";
              el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3), var(--ms-glow)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "rgba(255,255,255,0.02)";
              el.style.borderColor = "rgba(255,255,255,0.07)";
              el.style.color = "var(--ms-text-muted)";
              el.style.transform = "translateY(0)";
              el.style.boxShadow = "none";
            }}
          >
            <span style={{
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              color: "var(--ms-accent)",
              opacity: 0.8,
            }}>
              <def.icon size={16} />
            </span>
            <span>{def.label}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
};

export default NodePicker;
