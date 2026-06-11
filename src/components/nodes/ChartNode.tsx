import { useCallback, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, Trash2, Plus, X } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, ChartData, ChartDataPoint } from "../../types";

export type ChartNodeType = Node<{ mindNode: MindNode }, "chart">;

const PRESET_COLORS = ["#6366f1", "#84cc16", "#10b981", "#f59e0b", "#f87171", "#22d3ee"];

const HEADER_HEIGHT = 34;
const TOP_BAR_HEIGHT = 3;
const FOOTER_HEIGHT = 30;
const X_AXIS_HEIGHT = 28;
const Y_AXIS_WIDTH = 36;
const TOP_PADDING = 20;

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function niceMax(max: number): number {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

interface SvgChartProps {
  data: ChartData;
  width: number;
  height: number;
}

function SvgChart({ data, width, height }: SvgChartProps) {
  const { dataset, chart_type, color } = data;
  const chartColor = color || "var(--ms-accent)";

  const availableWidth = Math.max(width - Y_AXIS_WIDTH - 10, 60);
  const availableHeight = Math.max(height - X_AXIS_HEIGHT - TOP_PADDING, 40);

  const maxVal = niceMax(Math.max(...dataset.map((d) => d.value), 1));
  const gridLines = 4;
  const step = maxVal / gridLines;

  const barGap = 6;
  const barWidth = dataset.length > 0 ? Math.max((availableWidth - barGap * (dataset.length + 1)) / dataset.length, 4) : 40;

  function getX(i: number): number {
    return Y_AXIS_WIDTH + barGap + i * (barWidth + barGap);
  }

  function getY(val: number): number {
    return TOP_PADDING + availableHeight - (val / maxVal) * availableHeight;
  }

  const linePath = dataset
    .map((pt, i) => {
      const cx = getX(i) + barWidth / 2;
      const cy = getY(pt.value);
      return `${i === 0 ? "M" : "L"} ${cx} ${cy}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {/* Grid lines + Y labels */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const val = step * (gridLines - i);
        const y = TOP_PADDING + (i / gridLines) * availableHeight;
        return (
          <g key={i}>
            <line
              x1={Y_AXIS_WIDTH}
              y1={y}
              x2={Y_AXIS_WIDTH + availableWidth}
              y2={y}
              stroke="var(--ms-border)"
              strokeWidth={0.8}
              strokeDasharray={i === gridLines ? "0" : "3,3"}
            />
            <text
              x={Y_AXIS_WIDTH - 4}
              y={y + 4}
              textAnchor="end"
              fill="var(--ms-text-muted)"
              fontSize={9}
            >
              {val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : val}
            </text>
          </g>
        );
      })}

      {/* X axis */}
      <line
        x1={Y_AXIS_WIDTH}
        y1={TOP_PADDING + availableHeight}
        x2={Y_AXIS_WIDTH + availableWidth}
        y2={TOP_PADDING + availableHeight}
        stroke="var(--ms-border)"
        strokeWidth={1}
      />

      {/* Bars or Line */}
      {chart_type === "bar"
        ? dataset.map((pt, i) => {
            const barH = Math.max((pt.value / maxVal) * availableHeight, 1);
            const x = getX(i);
            const y = TOP_PADDING + availableHeight - barH;
            return (
              <g key={i}>
                <motion.rect
                  x={x}
                  width={barWidth}
                  initial={{ y: TOP_PADDING + availableHeight, height: 0 }}
                  animate={{ y, height: barH }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: i * 0.04 }}
                  fill={chartColor}
                  rx={2}
                  opacity={0.85}
                />
                {barWidth > 10 && pt.value > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fill="var(--ms-text-muted)"
                    fontSize={9}
                  >
                    {pt.value}
                  </text>
                )}
                {barWidth > 8 && (
                  <text
                    x={x + barWidth / 2}
                    y={TOP_PADDING + availableHeight + 12}
                    textAnchor="middle"
                    fill="var(--ms-text-muted)"
                    fontSize={9}
                    style={{ overflow: "hidden" }}
                  >
                    {pt.label.length > Math.max(Math.floor(barWidth / 6), 3)
                      ? pt.label.slice(0, Math.max(Math.floor(barWidth / 6), 3)) + "…"
                      : pt.label}
                  </text>
                )}
              </g>
            );
          })
        : (
          <>
            {/* Line chart */}
            <motion.path
              d={linePath}
              fill="none"
              stroke={chartColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            {/* Area fill */}
            <motion.path
              d={`${linePath} L ${getX(dataset.length - 1) + barWidth / 2} ${TOP_PADDING + availableHeight} L ${getX(0) + barWidth / 2} ${TOP_PADDING + availableHeight} Z`}
              fill={chartColor}
              opacity={0.12}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.12 }}
              transition={{ duration: 0.4 }}
            />
            {dataset.map((pt, i) => {
              const cx = getX(i) + barWidth / 2;
              const cy = getY(pt.value);
              return (
                <g key={i}>
                  <motion.circle
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={chartColor}
                    stroke="var(--ms-bg)"
                    strokeWidth={1.5}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  />
                  <text
                    x={cx}
                    y={cy - 8}
                    textAnchor="middle"
                    fill="var(--ms-text-muted)"
                    fontSize={9}
                  >
                    {pt.value}
                  </text>
                  {barWidth > 8 && (
                    <text
                      x={cx}
                      y={TOP_PADDING + availableHeight + 12}
                      textAnchor="middle"
                      fill="var(--ms-text-muted)"
                      fontSize={9}
                    >
                      {pt.label.length > Math.max(Math.floor(barWidth / 6), 3)
                        ? pt.label.slice(0, Math.max(Math.floor(barWidth / 6), 3)) + "…"
                        : pt.label}
                    </text>
                  )}
                </g>
              );
            })}
          </>
        )}
    </svg>
  );
}

interface EditableRow extends ChartDataPoint {
  id: string;
}

export function ChartNode({ data, selected }: NodeProps<ChartNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as ChartData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [editingData, setEditingData] = useState(false);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  const save = useCallback(
    (updates: Partial<ChartData>) => {
      updateNode(mindNode.id, { data: { ...d, ...updates } });
    },
    [d, mindNode.id, updateNode]
  );

  // Measure chart container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setChartSize({ width: rect.width, height: rect.height });
    });
    obs.observe(el);
    setChartSize({ width: el.clientWidth, height: el.clientHeight });
    return () => obs.disconnect();
  }, [editingData]);

  const openEditor = () => {
    setRows(d.dataset.map((pt) => ({ ...pt, id: generateId() })));
    setEditingData(true);
  };

  const closeEditor = () => {
    save({ dataset: rows.map(({ label, value }) => ({ label, value })) });
    setEditingData(false);
  };

  const updateRow = (id: string, field: "label" | "value", val: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, [field]: field === "value" ? parseFloat(val) || 0 : val }
          : r
      )
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, { id: generateId(), label: "Label", value: 0 }]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
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
        minWidth={240}
        minHeight={200}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: TOP_BAR_HEIGHT, background: "var(--ms-accent)", flexShrink: 0 }} />

      <div className="ms-node-header" style={{ flexShrink: 0, height: HEADER_HEIGHT, gap: 4 }}>
        <BarChart2 size={14} color="var(--ms-accent)" />
        <input
          className="nodrag nopan"
          value={d.title}
          onChange={(e) => save({ title: e.target.value })}
          placeholder="Chart title"
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
        {/* Bar/Line toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            save({ chart_type: d.chart_type === "bar" ? "line" : "bar" });
          }}
          title={`Switch to ${d.chart_type === "bar" ? "line" : "bar"} chart`}
          style={{
            background: "var(--ms-bg)",
            border: "1px solid var(--ms-border)",
            borderRadius: 4,
            color: "var(--ms-text-muted)",
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 6px",
            cursor: "pointer",
          }}
        >
          {d.chart_type === "bar" ? "BAR" : "LINE"}
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
        <AnimatePresence mode="wait">
          {editingData ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div style={{ flex: 1, overflow: "auto", padding: "6px 8px" }}>
                {/* Color presets */}
                <div style={{ display: "flex", gap: 5, marginBottom: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>Color:</span>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      className="nodrag nopan"
                      onClick={() => save({ color: c })}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 3,
                        background: c,
                        border: d.color === c ? "2px solid var(--ms-text)" : "2px solid transparent",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    />
                  ))}
                </div>

                {/* Data table */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                    <span style={{ flex: 1, fontSize: 10, color: "var(--ms-text-muted)", fontWeight: 600 }}>Label</span>
                    <span style={{ width: 70, fontSize: 10, color: "var(--ms-text-muted)", fontWeight: 600 }}>Value</span>
                    <span style={{ width: 20 }} />
                  </div>
                  {rows.map((row) => (
                    <div key={row.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        className="nodrag nopan"
                        value={row.label}
                        onChange={(e) => updateRow(row.id, "label", e.target.value)}
                        style={{
                          flex: 1,
                          background: "var(--ms-bg)",
                          border: "1px solid var(--ms-border)",
                          borderRadius: 4,
                          color: "var(--ms-text)",
                          fontSize: 11,
                          padding: "3px 6px",
                          outline: "none",
                        }}
                      />
                      <input
                        className="nodrag nopan"
                        type="number"
                        value={row.value}
                        onChange={(e) => updateRow(row.id, "value", e.target.value)}
                        style={{
                          width: 70,
                          background: "var(--ms-bg)",
                          border: "1px solid var(--ms-border)",
                          borderRadius: 4,
                          color: "var(--ms-text)",
                          fontSize: 11,
                          padding: "3px 6px",
                          outline: "none",
                        }}
                      />
                      <button
                        className="nodrag nopan"
                        onClick={() => removeRow(row.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", width: 20 }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="nodrag nopan"
                    onClick={addRow}
                    style={{
                      background: "none",
                      border: "1px dashed var(--ms-border)",
                      borderRadius: 4,
                      color: "var(--ms-text-muted)",
                      fontSize: 10,
                      padding: "4px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      marginTop: 2,
                    }}
                  >
                    <Plus size={10} /> Add row
                  </button>
                </div>
              </div>
              <div style={{ padding: "6px 8px", borderTop: "1px solid var(--ms-border)", display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="nodrag nopan"
                  onClick={closeEditor}
                  style={{
                    background: "var(--ms-accent)",
                    border: "none",
                    borderRadius: 5,
                    color: "var(--ms-bg)",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 14px",
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="chart"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div
                ref={containerRef}
                style={{ flex: 1, overflow: "hidden", padding: "4px 4px 0" }}
              >
                {d.dataset.length === 0 ? (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ms-text-muted)", fontSize: 12, fontStyle: "italic" }}>
                    No data — click Edit Data to add points
                  </div>
                ) : chartSize.width > 0 ? (
                  <SvgChart
                    data={d}
                    width={chartSize.width}
                    height={Math.max(chartSize.height - 4, 60)}
                  />
                ) : null}
              </div>
              <div
                style={{
                  flexShrink: 0,
                  height: FOOTER_HEIGHT,
                  borderTop: "1px solid var(--ms-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--ms-bg)",
                }}
              >
                <button
                  className="nodrag nopan"
                  onClick={openEditor}
                  style={{
                    background: "none",
                    border: "1px solid var(--ms-border)",
                    borderRadius: 5,
                    color: "var(--ms-text-muted)",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "3px 12px",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ms-accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-accent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ms-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
                >
                  Edit Data
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default ChartNode;
