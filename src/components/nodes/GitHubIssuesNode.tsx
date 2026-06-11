import { useCallback, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { GitBranch, Trash2, RefreshCw, Settings, Circle } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, GitHubIssuesData, GitHubIssueItem } from "../../types";
import { invoke } from "@tauri-apps/api/core";

async function openUrl(url: string) {
  try {
    const { openUrl: _open } = await import("@tauri-apps/plugin-opener");
    await _open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type GitHubIssuesNodeType = Node<{ mindNode: MindNode }, "github-issues">;

interface TauriHttpResponse {
  status: number;
  body: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function GitHubIssuesNode({ data, selected }: NodeProps<GitHubIssuesNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as GitHubIssuesData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(!d.repo);
  const [repoInput, setRepoInput] = useState(d.repo);
  const [filterInput, setFilterInput] = useState<"open" | "closed" | "all">(d.filter || "open");

  const fetchIssues = useCallback(
    async (repo: string, filter: "open" | "closed" | "all") => {
      if (!repo) return;
      setLoading(true);
      setError(null);
      try {
        const url = `https://api.github.com/repos/${repo}/issues?state=${filter}&per_page=30`;
        const resp = await invoke<TauriHttpResponse>("http_get", { url });
        if (resp.status === 404) throw new Error("Repository not found");
        if (resp.status === 403) throw new Error("Rate limit exceeded. Try again later.");
        if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
        const issues = JSON.parse(resp.body) as GitHubIssueItem[];
        updateNode(mindNode.id, {
          data: {
            ...d,
            repo,
            filter,
            issues,
            last_fetched: new Date().toISOString(),
          },
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to fetch issues");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mindNode.id]
  );

  const applySettings = useCallback(() => {
    const repo = repoInput.trim();
    if (!repo || !repo.includes("/")) {
      setError("Enter a valid repo in owner/repo format");
      return;
    }
    setError(null);
    setShowSettings(false);
    updateNode(mindNode.id, { data: { ...d, repo, filter: filterInput, issues: [], last_fetched: null } });
    fetchIssues(repo, filterInput);
  }, [repoInput, filterInput, d, mindNode.id, updateNode, fetchIssues]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={260}
        minHeight={200}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: 3, background: "var(--ms-text)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <GitBranch size={14} color="var(--ms-text)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {d.repo ? d.repo : "GitHub Issues"}
          {d.issues.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: "var(--ms-text-muted)" }}>
              {d.issues.length} {d.filter === "all" ? "" : d.filter}
            </span>
          )}
        </span>
        <motion.button
          onClick={(e) => { e.stopPropagation(); if (d.repo) fetchIssues(d.repo, d.filter); }}
          title="Refresh"
          animate={{ rotate: loading ? 360 : 0 }}
          transition={{ duration: 0.8, repeat: loading ? Infinity : 0, ease: "linear" }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <RefreshCw size={11} />
        </motion.button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowSettings(s => !s); }}
          title="Settings"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: showSettings ? "var(--ms-text)" : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <Settings size={11} />
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

      {/* Settings panel */}
      {showSettings && (
        <div
          className="nodrag nopan"
          style={{ padding: "8px 12px", background: "var(--ms-surface)", borderBottom: "1px solid var(--ms-border)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}
        >
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySettings(); }}
            placeholder="owner/repo"
            style={{ background: "var(--ms-bg)", border: "1px solid var(--ms-border)", borderRadius: 5, color: "var(--ms-text)", fontSize: 11, padding: "4px 8px", outline: "none" }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {(["open", "closed", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterInput(f)}
                style={{
                  flex: 1,
                  background: filterInput === f ? "var(--ms-accent)" : "var(--ms-bg)",
                  border: "1px solid var(--ms-border)",
                  borderRadius: 4,
                  color: filterInput === f ? "var(--ms-bg)" : "var(--ms-text-muted)",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "3px 0",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "var(--ms-text-muted)", fontStyle: "italic" }}>
            Public repos only (no auth)
          </div>
          <button
            onClick={applySettings}
            style={{ background: "var(--ms-accent)", border: "none", borderRadius: 4, color: "var(--ms-bg)", fontSize: 11, fontWeight: 700, padding: "4px 0", cursor: "pointer" }}
          >
            Fetch Issues
          </button>
        </div>
      )}

      {/* Body */}
      <div className="ms-node-body nodrag nopan" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {error && (
          <div style={{ fontSize: 11, color: "#f87171", padding: "8px 12px" }}>{error}</div>
        )}

        {!d.repo && !showSettings && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, padding: 12 }}>
            <GitBranch size={28} color="var(--ms-text-muted)" />
            <span style={{ fontSize: 11, color: "var(--ms-text-muted)", textAlign: "center" }}>
              Click the settings icon to configure a repository
            </span>
          </div>
        )}

        {loading && d.issues.length === 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>Loading…</span>
          </div>
        )}

        {d.issues.length > 0 && (
          <>
            {d.issues.map((issue) => (
              <button
                key={issue.number}
                onClick={() => openUrl(issue.html_url)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--ms-border)",
                  cursor: "pointer",
                  padding: "7px 12px",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ms-surface)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <Circle
                    size={9}
                    fill={issue.state === "open" ? "#22c55e" : "#a855f7"}
                    color={issue.state === "open" ? "#22c55e" : "#a855f7"}
                    style={{ marginTop: 3, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--ms-text)", lineHeight: 1.4, wordBreak: "break-word" }}>
                    <span style={{ color: "var(--ms-text-muted)", fontWeight: 600 }}>#{issue.number}</span>
                    {" "}
                    {issue.title}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 15, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, color: "var(--ms-text-muted)" }}>{timeAgo(issue.created_at)}</span>
                  {issue.labels.map((lbl) => (
                    <span
                      key={lbl.name}
                      style={{
                        fontSize: 9,
                        padding: "1px 5px",
                        borderRadius: 10,
                        background: `#${lbl.color}33`,
                        color: `#${lbl.color}`,
                        border: `1px solid #${lbl.color}55`,
                        fontWeight: 600,
                      }}
                    >
                      {lbl.name}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </>
        )}

        {d.issues.length === 0 && d.repo && !loading && !error && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>No issues found</span>
          </div>
        )}
      </div>

      {/* Footer */}
      {d.last_fetched && (
        <div style={{ padding: "3px 12px", borderTop: "1px solid var(--ms-border)", flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: "var(--ms-text-muted)" }}>Updated {timeAgo(d.last_fetched)}</span>
        </div>
      )}

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default GitHubIssuesNode;
