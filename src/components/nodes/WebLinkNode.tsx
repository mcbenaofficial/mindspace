import React, { useCallback, useEffect, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { useCmdKey } from '../../hooks/useCmdKey';
import { motion } from "framer-motion";
import { Globe, ExternalLink, Maximize2, Minimize2, Link, Trash2, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../../lib/tauri-compat";
import { useStore } from "../../store";
import { MindNode, WebLinkData } from "../../types";

interface SitePreview { title: string; description: string; image: string; siteName: string; }

function parseOgMeta(html: string, fallbackUrl: string): SitePreview {
  const get = (prop: string) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
    return m ? m[1] : "";
  };
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return {
    title: get("og:title") || get("twitter:title") || (titleTag ? titleTag[1].trim() : fallbackUrl),
    description: get("og:description") || get("twitter:description") || get("description") || "",
    image: get("og:image") || get("twitter:image") || "",
    siteName: get("og:site_name") || new URL(fallbackUrl).hostname,
  };
}

async function fetchPreview(url: string): Promise<SitePreview | null> {
  try {
    let html = "";
    if (isTauri()) {
      const res = await invoke<{ status: number; body: string }>("http_get", { url });
      if (res.status < 200 || res.status >= 300) return null;
      html = res.body;
    } else {
      const r = await fetch(url);
      if (!r.ok) return null;
      html = await r.text();
    }
    return parseOgMeta(html, url);
  } catch { return null; }
}

export type WebLinkNodeType = Node<{ mindNode: MindNode }, "web-link">;

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("?")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}
  return null;
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

async function openExternal(url: string) {
  try {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {}
}

export function WebLinkNode({ data, selected }: NodeProps<WebLinkNodeType>) {
  const { mindNode } = data;
  const linkData = mindNode.data as WebLinkData;
  const { updateNode, setEditingNodeId, deleteNode } = useStore();
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();

  const [fullMode, setFullMode] = useState(false);
  const [editingUrl, setEditingUrl] = useState(!linkData.url);
  const [urlInput, setUrlInput] = useState(linkData.url || "");
  const [preview, setPreview] = useState<SitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const toggleFullMode = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setFullMode((v) => !v);
      setTimeout(() => updateNodeInternals(mindNode.id), 0);
    },
    [mindNode.id, updateNodeInternals]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNodeId(mindNode.id);
    },
    [mindNode.id, setEditingNodeId]
  );

  const handleUrlSubmit = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    await updateNode(mindNode.id, { data: { ...linkData, url } });
    setEditingUrl(false);
    if (!getYouTubeEmbedUrl(url)) {
      setLoadingPreview(true);
      const p = await fetchPreview(url);
      setPreview(p);
      setLoadingPreview(false);
    }
  }, [urlInput, linkData, mindNode.id, updateNode]);

  const refreshPreview = useCallback(async () => {
    if (!linkData.url || getYouTubeEmbedUrl(linkData.url)) return;
    setLoadingPreview(true);
    const p = await fetchPreview(linkData.url);
    setPreview(p);
    setLoadingPreview(false);
  }, [linkData.url]);

  useEffect(() => {
    if (linkData.url && !getYouTubeEmbedUrl(linkData.url) && !preview && !loadingPreview) {
      fetchPreview(linkData.url).then(setPreview);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasUrl = !!linkData.url && isValidUrl(linkData.url);
  const embedUrl = hasUrl ? getYouTubeEmbedUrl(linkData.url) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{
        width: mindNode.width,
        height: fullMode ? "auto" : mindNode.height,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={120}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, params) => {
          updateNode(mindNode.id, { width: params.width, height: params.height });
        }}
      />

      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      <div className="ms-node-header" onDoubleClick={handleDoubleClick} style={{ flexShrink: 0 }}>
        <Globe size={14} color="var(--ms-accent)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>
          {linkData.title || "Web Link"}
        </span>
        {hasUrl && (
          <button
            onClick={(e) => { e.stopPropagation(); openExternal(linkData.url); }}
            title="Open in browser"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          >
            <ExternalLink size={11} />
          </button>
        )}
        <button
          onClick={toggleFullMode}
          title={fullMode ? "Collapse" : "Expand"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          {fullMode ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          title="Delete"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: fullMode ? 300 : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        {editingUrl || !hasUrl ? (
          <div style={{ padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ms-text-muted)" }}>
              <Link size={11} />
              <span>Paste a URL</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleUrlSubmit(); }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="https://youtube.com/watch?v=…"
                autoFocus
                style={{
                  flex: 1,
                  background: "var(--ms-border)",
                  border: "1px solid transparent",
                  borderRadius: 6,
                  color: "var(--ms-text)",
                  fontSize: 11,
                  padding: "5px 8px",
                  outline: "none",
                  userSelect: "text",
                  cursor: "text",
                }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); handleUrlSubmit(); }}
                disabled={!urlInput.trim()}
                style={{
                  padding: "5px 10px",
                  background: "var(--ms-accent)",
                  border: "none",
                  borderRadius: 6,
                  color: "var(--ms-bg)",
                  cursor: !urlInput.trim() ? "not-allowed" : "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  opacity: !urlInput.trim() ? 0.5 : 1,
                }}
              >
                Go
              </button>
            </div>
            {hasUrl && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditingUrl(false); }}
                style={{ background: "none", border: "none", color: "var(--ms-text-muted)", cursor: "pointer", fontSize: 10, textAlign: "left", padding: 0 }}
              >
                Cancel
              </button>
            )}
          </div>
        ) : embedUrl ? (
          <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column" }}>
            <iframe
              src={embedUrl}
              style={{ flex: 1, width: "100%", minHeight: fullMode ? 300 : 160, border: "none", display: "block" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title="YouTube video"
            />
            <button
              onClick={(e) => { e.stopPropagation(); setUrlInput(linkData.url); setEditingUrl(true); }}
              style={{
                position: "absolute",
                bottom: 6,
                right: 6,
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 5,
                color: "#fff",
                fontSize: 10,
                padding: "2px 7px",
                cursor: "pointer",
              }}
            >
              change
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {loadingPreview ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 10, color: "var(--ms-text-muted)", fontStyle: "italic" }}>Fetching preview…</span>
              </div>
            ) : preview ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {preview.image && (
                  <div style={{ height: fullMode ? 140 : 90, flexShrink: 0, overflow: "hidden" }}>
                    <img src={preview.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}
                <div style={{ flex: 1, padding: "8px 10px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 10, color: "var(--ms-accent)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.siteName}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ms-text)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{preview.title}</div>
                  {preview.description && (
                    <div style={{ fontSize: 10, color: "var(--ms-text-muted)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: fullMode ? 5 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{preview.description}</div>
                  )}
                  <div style={{ fontSize: 9, color: "var(--ms-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "auto", paddingTop: 4 }}>{linkData.url}</div>
                </div>
                <div style={{ borderTop: "1px solid var(--ms-border)", padding: "5px 8px", display: "flex", gap: 5, flexShrink: 0 }}>
                  <button onClick={(e) => { e.stopPropagation(); openExternal(linkData.url); }} style={{ flex: 1, padding: "4px 6px", background: "var(--ms-accent)", border: "none", borderRadius: 5, color: "var(--ms-bg)", cursor: "pointer", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                    <ExternalLink size={10} /> Open
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); refreshPreview(); }} title="Refresh preview" style={{ padding: "4px 7px", background: "var(--ms-border)", border: "none", borderRadius: 5, color: "var(--ms-text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}>
                    <RefreshCw size={10} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setUrlInput(linkData.url); setEditingUrl(true); }} style={{ padding: "4px 7px", background: "var(--ms-border)", border: "none", borderRadius: 5, color: "var(--ms-text-muted)", cursor: "pointer", fontSize: 10 }}>Edit</button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px" }}>
                <Globe size={24} color="var(--ms-text-muted)" style={{ opacity: 0.35 }} />
                <div style={{ fontSize: 10, color: "var(--ms-text-muted)", textAlign: "center", wordBreak: "break-all", lineHeight: 1.4 }}>{linkData.url}</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={(e) => { e.stopPropagation(); openExternal(linkData.url); }} style={{ padding: "4px 10px", background: "var(--ms-accent)", border: "none", borderRadius: 5, color: "var(--ms-bg)", cursor: "pointer", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}><ExternalLink size={10} /> Open</button>
                  <button onClick={(e) => { e.stopPropagation(); refreshPreview(); }} style={{ padding: "4px 8px", background: "var(--ms-border)", border: "none", borderRadius: 5, color: "var(--ms-text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}><RefreshCw size={10} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setUrlInput(linkData.url); setEditingUrl(true); }} style={{ padding: "4px 8px", background: "var(--ms-border)", border: "none", borderRadius: 5, color: "var(--ms-text-muted)", cursor: "pointer", fontSize: 10 }}>Edit</button>
                </div>
              </div>
            )}
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

export default WebLinkNode;
