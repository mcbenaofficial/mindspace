import { useCallback, useEffect, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Rss, Trash2, RefreshCw } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, RSSReaderData, RSSItem } from "../../types";
import { invoke } from "@tauri-apps/api/core";

async function openUrl(url: string) {
  try {
    const { openUrl: _open } = await import("@tauri-apps/plugin-opener");
    await _open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type RSSReaderNodeType = Node<{ mindNode: MindNode }, "rss-reader">;

interface TauriHttpResponse {
  status: number;
  body: string;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isNew(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
}

function parseRSS(xmlString: string): { items: RSSItem[]; feedTitle: string } {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) throw new Error("Invalid RSS feed");
  const items = Array.from(xmlDoc.querySelectorAll("item")).slice(0, 20).map((item) => ({
    title: item.querySelector("title")?.textContent ?? "",
    link: item.querySelector("link")?.textContent ?? "",
    pub_date: item.querySelector("pubDate")?.textContent ?? "",
    description: item.querySelector("description")?.textContent?.replace(/<[^>]+>/g, "").trim() ?? "",
  }));
  const feedTitle = xmlDoc.querySelector("channel > title")?.textContent ?? "";
  return { items, feedTitle };
}

export function RSSReaderNode({ data, selected }: NodeProps<RSSReaderNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as RSSReaderData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(d.feed_url);

  const fetchFeed = useCallback(
    async (feedUrl: string) => {
      if (!feedUrl) return;
      setLoading(true);
      setError(null);
      try {
        const resp = await invoke<TauriHttpResponse>("http_get", { url: feedUrl });
        if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
        const { items, feedTitle } = parseRSS(resp.body);
        updateNode(mindNode.id, {
          data: {
            ...d,
            feed_url: feedUrl,
            feed_title: feedTitle || d.feed_title || "RSS Feed",
            items,
            last_fetched: new Date().toISOString(),
          },
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to fetch feed");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mindNode.id]
  );

  useEffect(() => {
    if (!d.feed_url) return;
    const shouldFetch =
      d.last_fetched === null ||
      Date.now() - new Date(d.last_fetched).getTime() > 30 * 60 * 1000;
    if (shouldFetch) fetchFeed(d.feed_url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    fetchFeed(url);
  }, [urlInput, fetchFeed]);

  const resetFeed = useCallback(() => {
    updateNode(mindNode.id, {
      data: { ...d, feed_url: "", feed_title: "", items: [], last_fetched: null },
    });
    setUrlInput("");
    setError(null);
  }, [d, mindNode.id, updateNode]);

  const isSetup = !!d.feed_url;

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

      <div style={{ height: 3, background: "#f97316", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Rss size={14} color="#f97316" />
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ms-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {d.feed_title || "RSS Feed"}
          {d.items.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: "var(--ms-text-muted)" }}>
              {d.items.length}
            </span>
          )}
        </span>
        {isSetup && (
          <motion.button
            onClick={(e) => { e.stopPropagation(); fetchFeed(d.feed_url); }}
            title="Refresh"
            animate={{ rotate: loading ? 360 : 0 }}
            transition={{ duration: 0.8, repeat: loading ? Infinity : 0, ease: "linear" }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          >
            <RefreshCw size={11} />
          </motion.button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <div className="ms-node-body nodrag nopan" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Setup state */}
        {!isSetup && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 16 }}>
            <Rss size={28} color="#f97316" />
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") subscribe(); }}
              placeholder="https://example.com/feed.xml"
              autoFocus
              style={{
                width: "100%",
                background: "var(--ms-bg)",
                border: "1px solid var(--ms-border)",
                borderRadius: 5,
                color: "var(--ms-text)",
                fontSize: 11,
                padding: "5px 8px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {error && (
              <span style={{ fontSize: 10, color: "#f87171", textAlign: "center" }}>{error}</span>
            )}
            <button
              onClick={subscribe}
              disabled={loading}
              style={{
                width: "100%",
                background: "#f97316",
                border: "none",
                borderRadius: 5,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 0",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Fetching…" : "Subscribe"}
            </button>
          </div>
        )}

        {/* Feed items */}
        {isSetup && (
          <>
            {error && (
              <div style={{ fontSize: 11, color: "#f87171", padding: "8px 12px", flexShrink: 0 }}>{error}</div>
            )}
            {loading && d.items.length === 0 && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>Loading…</span>
              </div>
            )}
            {d.items.length > 0 &&
              d.items.map((item, i) => (
                <button
                  key={i}
                  onClick={() => item.link && openUrl(item.link)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--ms-border)",
                    cursor: "pointer",
                    padding: "7px 12px",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ms-surface)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                    {isNew(item.pub_date) && (
                      <span
                        style={{
                          fontSize: 8,
                          background: "#f97316",
                          color: "#fff",
                          borderRadius: 3,
                          padding: "1px 4px",
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        NEW
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--ms-text)",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        wordBreak: "break-word",
                        fontWeight: 500,
                      }}
                    >
                      {item.title}
                    </span>
                  </div>
                  {item.pub_date && (
                    <span style={{ fontSize: 9, color: "var(--ms-text-muted)" }}>{timeAgo(item.pub_date)}</span>
                  )}
                  {item.description && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--ms-text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                        display: "block",
                      }}
                    >
                      {item.description}
                    </span>
                  )}
                </button>
              ))}
            {d.items.length === 0 && !loading && !error && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>No items in feed</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {isSetup && (
        <div
          style={{
            padding: "4px 12px",
            borderTop: "1px solid var(--ms-border)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 9, color: "var(--ms-text-muted)" }}>
            {d.last_fetched ? `Updated ${timeAgo(d.last_fetched)}` : "Never fetched"}
          </span>
          <button
            className="nodrag nopan"
            onClick={resetFeed}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "var(--ms-text-muted)", padding: 0, textDecoration: "underline" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
          >
            Change feed
          </button>
        </div>
      )}

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default RSSReaderNode;
