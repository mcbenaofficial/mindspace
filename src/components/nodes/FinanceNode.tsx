import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { TrendingUp, Plus, X, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, FinanceData } from "../../types";

export type FinanceNodeType = Node<{ mindNode: MindNode }, "finance">;

interface QuoteResult {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
}

interface TauriHttpResponse {
  status: number;
  body: string;
}

async function fetchQuotes(symbols: string[]): Promise<QuoteResult[]> {
  if (!symbols.length) return [];
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,currency`;
  const resp = await invoke<TauriHttpResponse>("http_get", { url });
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
  const json = JSON.parse(resp.body);
  return (json?.quoteResponse?.result ?? []) as QuoteResult[];
}

export function FinanceNode({ data, selected }: NodeProps<FinanceNodeType>) {
  const { mindNode } = data;
  const finData = mindNode.data as FinanceData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [quotes, setQuotes] = useState<QuoteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTicker, setNewTicker] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return;
    setLoading(true);
    setError(null);
    try {
      const results = await fetchQuotes(tickers);
      setQuotes(results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(finData.tickers);
    timerRef.current = setInterval(() => refresh(finData.tickers), 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finData.tickers.join(",")]);

  const addTicker = useCallback(() => {
    const t = newTicker.trim().toUpperCase();
    setNewTicker("");
    setAdding(false);
    if (!t || finData.tickers.includes(t)) return;
    const updated = [...finData.tickers, t];
    updateNode(mindNode.id, { data: { ...finData, tickers: updated } });
  }, [newTicker, finData, mindNode.id, updateNode]);

  const removeTicker = useCallback(
    (symbol: string) => {
      updateNode(mindNode.id, {
        data: { ...finData, tickers: finData.tickers.filter((t) => t !== symbol) },
      });
      setQuotes((prev) => prev.filter((q) => q.symbol !== symbol));
    },
    [finData, mindNode.id, updateNode]
  );

  const fmt = (n?: number, d = 2) => (n != null ? n.toFixed(d) : "—");

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
        minHeight={160}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: 3, background: "#10b981", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <TrendingUp size={14} color="#10b981" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Finance</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAdding((v) => !v);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          title="Add ticker"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <Plus size={12} />
        </button>
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            refresh(finData.tickers);
          }}
          title="Refresh"
          animate={{ rotate: loading ? 360 : 0 }}
          transition={{ duration: 0.8, repeat: loading ? Infinity : 0, ease: "linear" }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", originX: "50%", originY: "50%" }}
        >
          {/* refresh icon as SVG inline so motion works */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-3" />
          </svg>
        </motion.button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Add ticker row */}
      {adding && (
        <div style={{ padding: "4px 12px", flexShrink: 0, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTicker();
              if (e.key === "Escape") { setAdding(false); setNewTicker(""); }
            }}
            placeholder="AAPL, BTC-USD…"
            style={{
              flex: 1,
              background: "var(--ms-bg)",
              border: "1px solid var(--ms-border)",
              borderRadius: 5,
              color: "var(--ms-text)",
              fontSize: 11,
              padding: "3px 7px",
              outline: "none",
            }}
          />
          <button
            onClick={addTicker}
            style={{ background: "#10b981", border: "none", borderRadius: 4, color: "#fff", fontSize: 10, fontWeight: 600, padding: "3px 8px", cursor: "pointer" }}
          >
            Add
          </button>
        </div>
      )}

      {/* Body */}
      <div
        className="ms-node-body"
        style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 5 }}
      >
        {error && (
          <div style={{ fontSize: 11, color: "#f87171", padding: "2px 0" }}>
            {error}
          </div>
        )}

        {!finData.tickers.length && !adding && (
          <div style={{ fontSize: 11, color: "var(--ms-text-muted)", fontStyle: "italic" }}>
            Click + to add a ticker (e.g. AAPL, BTC-USD)
          </div>
        )}

        {finData.tickers.map((symbol) => {
          const q = quotes.find((r) => r.symbol === symbol);
          const change = q?.regularMarketChange;
          const pct = q?.regularMarketChangePercent;
          const isPos = (change ?? 0) >= 0;
          const changeColor = isPos ? "#10b981" : "#f87171";

          return (
            <div
              key={symbol}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: "var(--ms-bg)",
                borderRadius: 6,
                border: "1px solid var(--ms-border)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ms-text)", letterSpacing: "0.04em" }}>
                  {symbol}
                </div>
                {q?.shortName && (
                  <div style={{ fontSize: 10, color: "var(--ms-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {q.shortName}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>
                  {q
                    ? `${q.currency === "USD" ? "$" : ""}${fmt(q.regularMarketPrice)}`
                    : loading
                    ? "…"
                    : "—"}
                </div>
                {q && change != null && (
                  <div style={{ fontSize: 10, color: changeColor }}>
                    {isPos ? "+" : ""}
                    {fmt(change)} ({isPos ? "+" : ""}
                    {fmt(pct)}%)
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeTicker(symbol); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--ms-text-muted)", display: "flex", flexShrink: 0 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default FinanceNode;
