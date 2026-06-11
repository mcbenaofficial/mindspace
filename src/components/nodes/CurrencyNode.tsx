import { useCallback, useState, useEffect } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { ArrowLeftRight, Trash2, Plus, X, RefreshCw } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, CurrencyData } from "../../types";

export type CurrencyNodeType = Node<{ mindNode: MindNode }, "currency">;

const ACCENT = "#10b981";

const FLAG: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", INR: "🇮🇳",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", CNY: "🇨🇳", KRW: "🇰🇷",
  BRL: "🇧🇷", MXN: "🇲🇽", SGD: "🇸🇬", HKD: "🇭🇰", NOK: "🇳🇴",
  SEK: "🇸🇪", DKK: "🇩🇰", NZD: "🇳🇿", ZAR: "🇿🇦", RUB: "🇷🇺",
};

const ALL_CURRENCIES = Object.keys(FLAG);

function minutesAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export function CurrencyNode({ data, selected }: NodeProps<CurrencyNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as CurrencyData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(d.amount ?? 1));
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [newCurrency, setNewCurrency] = useState("");

  const fetchRates = useCallback(async (base: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = `https://open.er-api.com/v6/latest/${base}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.result !== "success") throw new Error(json["error-type"] ?? "API error");
      const rates: Record<string, number> = json.rates ?? {};
      updateNode(mindNode.id, {
        data: { ...d, base, rates, last_fetched: new Date().toISOString() },
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch rates");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindNode.id]);

  useEffect(() => {
    const stale =
      !d.last_fetched ||
      minutesAgo(d.last_fetched) > 30;
    if (stale) fetchRates(d.base);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAmountChange = (val: string) => {
    setAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      updateNode(mindNode.id, { data: { ...d, amount: num } });
    }
  };

  const handleBaseChange = (base: string) => {
    updateNode(mindNode.id, { data: { ...d, base } });
    fetchRates(base);
  };

  const addTarget = (code: string) => {
    const upper = code.toUpperCase().trim();
    if (!upper || d.targets.includes(upper)) return;
    updateNode(mindNode.id, { data: { ...d, targets: [...d.targets, upper] } });
    setNewCurrency("");
    setShowAddCurrency(false);
  };

  const removeTarget = (code: string) => {
    updateNode(mindNode.id, { data: { ...d, targets: d.targets.filter((t) => t !== code) } });
  };

  const numAmount = parseFloat(amount) || 1;
  const lastUpdatedText = d.last_fetched
    ? (() => {
        const mins = minutesAgo(d.last_fetched);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        return `${Math.floor(mins / 60)}h ago`;
      })()
    : null;

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
        minHeight={200}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: 3, background: ACCENT, flexShrink: 0 }} />

      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <ArrowLeftRight size={14} color={ACCENT} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Currency</span>
        <motion.button
          onClick={(e) => { e.stopPropagation(); fetchRates(d.base); }}
          title="Refresh rates"
          animate={{ rotate: loading ? 360 : 0 }}
          transition={{ duration: 0.8, repeat: loading ? Infinity : 0, ease: "linear" }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <RefreshCw size={11} />
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

      <div className="ms-node-body nodrag nopan" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px" }}>
        {/* Amount + base currency row */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            className="nodrag nopan"
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            style={{
              flex: 1,
              background: "var(--ms-bg)",
              border: "1px solid var(--ms-border)",
              borderRadius: 6,
              color: "var(--ms-text)",
              fontSize: 20,
              fontWeight: 700,
              padding: "6px 10px",
              outline: "none",
              width: 0,
            }}
          />
          <select
            className="nodrag nopan"
            value={d.base}
            onChange={(e) => handleBaseChange(e.target.value)}
            style={{
              background: "var(--ms-bg)",
              border: "1px solid var(--ms-border)",
              borderRadius: 6,
              color: "var(--ms-text)",
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 8px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {ALL_CURRENCIES.map((c) => (
              <option key={c} value={c}>{FLAG[c] ?? ""} {c}</option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ fontSize: 11, color: "#f87171", textAlign: "center" }}>{error}</div>
        )}

        {loading && Object.keys(d.rates).length === 0 && (
          <div style={{ fontSize: 11, color: "var(--ms-text-muted)", textAlign: "center" }}>Loading rates…</div>
        )}

        {/* Target currency rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {d.targets.map((code) => {
            const rate = d.rates[code];
            const converted = rate != null ? (numAmount * rate).toFixed(code === "JPY" || code === "KRW" ? 0 : 2) : "—";
            return (
              <div
                key={code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--ms-bg)",
                  borderRadius: 6,
                  padding: "5px 8px",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 16 }}>{FLAG[code] ?? "🏳️"}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ms-text-muted)", minWidth: 30 }}>{code}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--ms-text)", textAlign: "right" }}>
                  {converted}
                </span>
                <button
                  className="nodrag nopan"
                  onClick={() => removeTarget(code)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add currency */}
        {showAddCurrency ? (
          <div style={{ display: "flex", gap: 6 }}>
            <select
              className="nodrag nopan"
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                background: "var(--ms-bg)",
                border: "1px solid var(--ms-border)",
                borderRadius: 5,
                color: "var(--ms-text)",
                fontSize: 11,
                padding: "4px 6px",
                outline: "none",
              }}
            >
              <option value="">Select currency…</option>
              {ALL_CURRENCIES.filter((c) => c !== d.base && !d.targets.includes(c)).map((c) => (
                <option key={c} value={c}>{FLAG[c] ?? ""} {c}</option>
              ))}
            </select>
            <button
              className="nodrag nopan"
              onClick={() => { if (newCurrency) addTarget(newCurrency); }}
              style={{ background: ACCENT, border: "none", borderRadius: 4, color: "#000", fontSize: 10, fontWeight: 700, padding: "4px 9px", cursor: "pointer" }}
            >
              Add
            </button>
            <button
              className="nodrag nopan"
              onClick={() => setShowAddCurrency(false)}
              style={{ background: "var(--ms-bg)", border: "1px solid var(--ms-border)", borderRadius: 4, color: "var(--ms-text-muted)", fontSize: 10, padding: "4px 6px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="nodrag nopan"
            onClick={() => setShowAddCurrency(true)}
            style={{
              background: "none",
              border: `1px dashed var(--ms-border)`,
              borderRadius: 6,
              color: "var(--ms-text-muted)",
              fontSize: 11,
              padding: "5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <Plus size={11} /> Add currency
          </button>
        )}

        {/* Footer */}
        {lastUpdatedText && (
          <div style={{ fontSize: 10, color: "var(--ms-text-muted)", textAlign: "center", marginTop: "auto", paddingTop: 4 }}>
            Last updated: {lastUpdatedText}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default CurrencyNode;
