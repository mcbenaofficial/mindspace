import { useCallback, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Calculator, Trash2, Clock } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, CalculatorData } from "../../types";

export type CalculatorNodeType = Node<{ mindNode: MindNode }, "calculator">;

const BUTTONS = [
  ["C", "±", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["history", "0", ".", "="],
];

function isOperator(v: string) {
  return ["÷", "×", "−", "+"].includes(v);
}

function evaluate(expr: string): string {
  try {
    // Replace display operators with JS operators
    const jsExpr = expr
      .replace(/÷/g, "/")
      .replace(/×/g, "*")
      .replace(/−/g, "-");
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${jsExpr})`)();
    if (!isFinite(result)) return "Error";
    // Trim floating point noise
    const rounded = parseFloat(result.toPrecision(12));
    return String(rounded);
  } catch {
    return "Error";
  }
}

export function CalculatorNode({ data, selected }: NodeProps<CalculatorNodeType>) {
  const { mindNode } = data;
  const calcData = mindNode.data as CalculatorData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();
  const [showHistory, setShowHistory] = useState(false);

  const expr = calcData.expression;
  const result = calcData.result;
  const history = calcData.history ?? [];

  const updateData = useCallback(
    (patch: Partial<CalculatorData>) => {
      updateNode(mindNode.id, { data: { ...calcData, ...patch } });
    },
    [calcData, mindNode.id, updateNode]
  );

  const handleButton = useCallback(
    (btn: string) => {
      if (btn === "history") {
        setShowHistory((v) => !v);
        return;
      }

      if (btn === "C") {
        updateData({ expression: "", result: "0" });
        return;
      }

      if (btn === "=") {
        if (!expr) return;
        const res = evaluate(expr);
        const entry = `${expr} = ${res}`;
        updateData({
          expression: res === "Error" ? expr : res,
          result: res,
          history: res !== "Error" ? [entry, ...history.slice(0, 19)] : history,
        });
        return;
      }

      if (btn === "±") {
        if (!expr) return;
        const negated = expr.startsWith("-") ? expr.slice(1) : `-${expr}`;
        updateData({ expression: negated });
        return;
      }

      if (btn === "%") {
        if (!expr) return;
        const res = evaluate(`(${expr})/100`);
        updateData({ expression: res, result: res });
        return;
      }

      if (isOperator(btn)) {
        // Replace trailing operator or append
        const trimmed = expr.replace(/[÷×−+]$/, "");
        updateData({ expression: trimmed + btn });
        return;
      }

      // Digit or dot
      updateData({ expression: expr + btn });
    },
    [expr, history, updateData]
  );

  const displayValue = expr || result;

  const btnStyle = (btn: string): React.CSSProperties => {
    const isEq = btn === "=";
    const isOp = isOperator(btn) || btn === "=";
    const isTop = ["C", "±", "%"].includes(btn);
    const isHistory = btn === "history";
    return {
      flex: btn === "0" ? "2 1 0" : "1 1 0",
      padding: "12px 4px",
      border: "none",
      borderRadius: 8,
      fontSize: btn === "history" ? 10 : 15,
      fontWeight: 500,
      cursor: "pointer",
      transition: "filter 0.1s",
      background: isEq
        ? "var(--ms-accent)"
        : isOp
        ? "color-mix(in srgb, var(--ms-accent) 20%, var(--ms-bg))"
        : isTop || isHistory
        ? "var(--ms-border)"
        : "var(--ms-bg)",
      color: isEq ? "var(--ms-surface)" : isOp ? "var(--ms-accent)" : "var(--ms-text)",
    };
  };

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
        minHeight={300}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Calculator size={14} color="var(--ms-accent)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Calculator</span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowHistory((v) => !v); }}
          title="History"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: showHistory ? "var(--ms-accent)" : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <Clock size={12} />
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

      {/* Display */}
      <div
        style={{
          padding: "8px 12px 6px",
          background: "var(--ms-bg)",
          borderBottom: "1px solid var(--ms-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 11, color: "var(--ms-text-muted)", minHeight: 16, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {expr && expr !== result ? expr : " "}
        </div>
        <div style={{ fontSize: 26, fontWeight: 300, color: "var(--ms-text)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
          {displayValue || "0"}
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div style={{ flex: 1, overflow: "auto", padding: "6px 10px", borderBottom: "1px solid var(--ms-border)" }}>
          {history.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--ms-text-muted)", fontStyle: "italic", textAlign: "center", paddingTop: 8 }}>No history yet</div>
          ) : history.map((h, i) => (
            <div
              key={i}
              style={{ fontSize: 11, color: "var(--ms-text-muted)", padding: "3px 0", borderBottom: "1px solid var(--ms-border)", cursor: "pointer" }}
              onClick={() => {
                const res = h.split(" = ")[1];
                if (res) updateData({ expression: res, result: res });
              }}
            >{h}</div>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div
        className="nodrag nopan"
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: "8px 8px 10px" }}
      >
        {BUTTONS.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: 4, flex: 1 }}>
            {row.map((btn) => (
              <button
                key={btn}
                onClick={(e) => { e.stopPropagation(); handleButton(btn); }}
                style={btnStyle(btn)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
              >
                {btn === "history" ? "HIST" : btn}
              </button>
            ))}
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

export default CalculatorNode;
