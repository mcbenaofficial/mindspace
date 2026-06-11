import React, { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { useCmdKey } from '../../hooks/useCmdKey';
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, Trash2, Copy, Check, Plus, ChevronLeft, ChevronRight, MessageSquare, Paperclip, X, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../../lib/tauri-compat";
import { useStore } from "../../store";
import { MindNode, AiChatData, AiChatConversation, AiChatMessage, AiChatAttachment, NoteData, TaskData, VoiceData, WebLinkData, FileData } from "../../types";

export type AiChatNodeType = Node<{ mindNode: MindNode }, "ai-chat">;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function normalizeChatData(raw: any): AiChatData {
  if (Array.isArray(raw?.conversations)) return raw as AiChatData;
  const msgs: AiChatMessage[] = raw?.messages || [];
  return {
    conversations: msgs.length > 0 ? [{
      id: genId(),
      title: msgs.find(m => m.role === "user")?.content.slice(0, 50) || "Chat",
      messages: msgs,
      created_at: msgs[0].timestamp,
      updated_at: msgs[msgs.length - 1].timestamp,
    }] : [],
    active_conversation_id: null,
    model: raw?.model || "",
    system_prompt: raw?.system_prompt || "",
  };
}

function extractTipTapText(content: string): string {
  if (!content) return "";
  try {
    const doc = JSON.parse(content);
    const texts: string[] = [];
    function walk(node: any) {
      if (node.text) texts.push(node.text);
      if (Array.isArray(node.content)) node.content.forEach(walk);
    }
    walk(doc);
    return texts.join(" ").trim();
  } catch { return content; }
}

function buildNodeContext(node: MindNode): string | null {
  switch (node.type) {
    case "note": {
      const d = node.data as NoteData;
      const text = extractTipTapText(d.content);
      if (!text) return null;
      return `[Note: "${d.title}"]\n${text}`;
    }
    case "task": {
      const d = node.data as TaskData;
      const items = d.items.map(i => `${i.checked ? "[x]" : "[ ]"} ${i.text}`).join("\n");
      if (!items) return null;
      return `[Task: "${d.title}"]\n${items}`;
    }
    case "voice": {
      const d = node.data as VoiceData;
      if (!d.transcript) return null;
      return `[Voice Transcript]\n${d.transcript}`;
    }
    case "web-link": {
      const d = node.data as WebLinkData;
      if (!d.url) return null;
      return `[Web Link: ${d.title || d.url}]\n${d.url}`;
    }
    case "file": {
      const d = node.data as FileData;
      if (!d.content) return null;
      return `[Document: "${d.fileName}" (${d.fileType?.toUpperCase()})]\n${d.content}${d.truncated ? "\n[…truncated]" : ""}`;
    }
    default: return null;
  }
}

// ─── Pending file attachment (in-memory only, not persisted) ──────────────────
interface PendingFile {
  id: string;
  name: string;
  mediaType: "image" | "document";
  mimeType: string;
  fullData: string;    // base64 for images, text content for documents
  thumbnail?: string;  // small data URL for image preview
}

async function generateImageThumbnail(file: File): Promise<{ fullBase64: string; thumbnail: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      const img = new Image();
      img.onload = () => {
        const maxSize = 128;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve({ fullBase64: base64, thumbnail: canvas.toDataURL("image/jpeg", 0.72) });
      };
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "6px 8px", alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <motion.div key={i}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ms-text-muted)" }}
        />
      ))}
    </div>
  );
}

// ─── Attachment chip (for pending + message display) ─────────────────────────
function AttachmentChip({ attachment, onRemove }: { attachment: AiChatAttachment | PendingFile; onRemove?: () => void }) {
  const thumb = (attachment as PendingFile).thumbnail ?? (attachment as AiChatAttachment).thumbnail;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      background: "var(--ms-border)", borderRadius: 6,
      padding: thumb ? "2px 6px 2px 2px" : "3px 8px",
      fontSize: 10, color: "var(--ms-text)", maxWidth: 140,
    }}>
      {thumb ? (
        <img src={thumb} alt={attachment.name} style={{ width: 22, height: 22, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <FileText size={12} color="var(--ms-text-muted)" style={{ flexShrink: 0 }} />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{attachment.name}</span>
      {onRemove && (
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ─── AiChatNode ───────────────────────────────────────────────────────────────
export function AiChatNode({ data, selected }: NodeProps<AiChatNodeType>) {
  const { mindNode } = data;
  const chatData = normalizeChatData(mindNode.data);
  const { updateNode, setEditingNodeId, settings, nodes, edges, deleteNode } = useStore();
  const cmdDown = useCmdKey();
  const updateNodeInternals = useUpdateNodeInternals();

  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!Array.isArray((mindNode.data as any)?.conversations)) {
      updateNode(mindNode.id, { data: chatData });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeConv: AiChatConversation | null =
    chatData.conversations.find(c => c.id === chatData.active_conversation_id) ?? null;

  const sortedConvs = [...chatData.conversations].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages.length, isTyping]);

  // ── Conversation management ─────────────────────────────────────────────────
  const newConversation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const conv: AiChatConversation = {
      id: genId(),
      title: "New conversation",
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    updateNode(mindNode.id, {
      data: {
        ...chatData,
        conversations: [conv, ...chatData.conversations],
        active_conversation_id: conv.id,
      },
    });
  }, [chatData, mindNode.id, updateNode]);

  const openConversation = useCallback((id: string) => {
    updateNode(mindNode.id, { data: { ...chatData, active_conversation_id: id } });
    updateNodeInternals(mindNode.id);
  }, [chatData, mindNode.id, updateNode, updateNodeInternals]);

  const goToList = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateNode(mindNode.id, { data: { ...chatData, active_conversation_id: null } });
    updateNodeInternals(mindNode.id);
  }, [chatData, mindNode.id, updateNode, updateNodeInternals]);

  const deleteConversation = useCallback((convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = chatData.conversations.filter(c => c.id !== convId);
    updateNode(mindNode.id, {
      data: {
        ...chatData,
        conversations: remaining,
        active_conversation_id: chatData.active_conversation_id === convId ? null : chatData.active_conversation_id,
      },
    });
  }, [chatData, mindNode.id, updateNode]);

  // ── File attachment handling ─────────────────────────────────────────────────
  const ACCEPTED = "image/jpeg,image/png,image/gif,image/webp,text/plain,text/markdown,text/csv,application/json";

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";

    const newPending: PendingFile[] = [];
    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        try {
          const { fullBase64, thumbnail } = await generateImageThumbnail(file);
          newPending.push({ id: genId(), name: file.name, mediaType: "image", mimeType: file.type, fullData: fullBase64, thumbnail });
        } catch { /* skip unreadable file */ }
      } else {
        try {
          const text = await readTextFile(file);
          newPending.push({ id: genId(), name: file.name, mediaType: "document", mimeType: file.type, fullData: text });
        } catch { /* skip unreadable file */ }
      }
    }
    setPendingFiles(prev => [...prev, ...newPending]);
  }, []);

  const removePendingFile = useCallback((id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if ((!text && pendingFiles.length === 0) || isTyping || !activeConv) return;

    const imageFiles = pendingFiles.filter(f => f.mediaType === "image");
    const docFiles = pendingFiles.filter(f => f.mediaType === "document");

    // Build display text for stored message
    const displayText = text || (pendingFiles.length > 0 ? "(attachment)" : "");

    // Build API text — prepend document file contents as inline context
    let apiText = text;
    if (docFiles.length > 0) {
      const docCtx = docFiles.map(f => `[File: ${f.name}]\n${f.fullData}`).join("\n\n");
      apiText = docCtx + (text ? "\n\n" + text : "");
    }

    const messageAttachments: AiChatAttachment[] = pendingFiles.map(f => ({
      name: f.name,
      mediaType: f.mediaType,
      mimeType: f.mimeType,
      thumbnail: f.thumbnail,
    }));

    const userMsg: AiChatMessage = {
      id: genId(), role: "user",
      content: displayText,
      timestamp: new Date().toISOString(),
      attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
    };

    const now = new Date().toISOString();
    const isFirst = activeConv.messages.length === 0;
    const updatedConv: AiChatConversation = {
      ...activeConv,
      title: isFirst ? (text || pendingFiles[0]?.name || "Chat").slice(0, 50) : activeConv.title,
      messages: [...activeConv.messages, userMsg],
      updated_at: now,
    };

    const patchData = (msgs: AiChatMessage[]): AiChatData => ({
      ...chatData,
      conversations: chatData.conversations.map(c =>
        c.id === activeConv.id ? { ...updatedConv, messages: msgs } : c
      ),
    });

    await updateNode(mindNode.id, { data: patchData(updatedConv.messages) });
    setInputValue("");
    setPendingFiles([]);
    setIsTyping(true);

    try {
      // Build history as string content (past messages), current message may be multimodal
      type ApiContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
      type ApiMsg = { role: "user" | "assistant" | "system"; content: string | ApiContentPart[] };

      const historyMsgs: ApiMsg[] = updatedConv.messages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Current user message — use vision format if images are attached
      let currentContent: string | ApiContentPart[];
      if (imageFiles.length > 0) {
        const parts: ApiContentPart[] = [{ type: "text", text: apiText || "Describe this." }];
        for (const img of imageFiles) {
          parts.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.fullData}` } });
        }
        currentContent = parts;
      } else {
        currentContent = apiText;
      }

      // Keep last 20 exchanges to avoid context overflow on large models
      const trimmedHistory = historyMsgs.slice(-40);
      const apiMessages: ApiMsg[] = [...trimmedHistory, { role: "user", content: currentContent }];

      // Inject context from connected nodes
      const connectedIds = edges
        .filter(e => e.source === mindNode.id || e.target === mindNode.id)
        .map(e => e.source === mindNode.id ? e.target : e.source);
      const contextParts = nodes
        .filter(n => connectedIds.includes(n.id) && n.id !== mindNode.id)
        .map(buildNodeContext).filter(Boolean) as string[];

      let systemContent = "";
      if (contextParts.length > 0) systemContent += `You have access to the following context from connected nodes:\n\n${contextParts.join("\n\n")}\n\n`;
      if (chatData.system_prompt) systemContent += chatData.system_prompt;
      if (systemContent) apiMessages.unshift({ role: "system", content: systemContent });

      const url = (settings.lmstudio_url || "http://127.0.0.1:1234") + "/v1/chat/completions";
      const payload = JSON.stringify({
        model: settings.lmstudio_model || chatData.model || "local-model",
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: settings.lmstudio_max_tokens || 1024,
      });

      let json: any;
      if (isTauri()) {
        const res = await invoke<{ status: number; body: string }>("http_post", { url, body: payload, apiKey: null });
        if (res.status < 200 || res.status >= 300) {
          let detail = "";
          try { detail = JSON.parse(res.body)?.error?.message || res.body; } catch { detail = res.body; }
          throw new Error(`API error ${res.status}: ${detail}`);
        }
        json = JSON.parse(res.body);
      } else {
        const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
        if (!resp.ok) throw new Error(`API error ${resp.status}`);
        json = await resp.json();
      }

      const assistantMsg: AiChatMessage = {
        id: genId(), role: "assistant",
        content: json.choices?.[0]?.message?.content ?? "(no response)",
        timestamp: new Date().toISOString(),
      };
      await updateNode(mindNode.id, { data: patchData([...updatedConv.messages, assistantMsg]) });
    } catch (err) {
      const errMsg: AiChatMessage = {
        id: genId(), role: "assistant",
        content: `Error: ${(err as Error).message}`,
        timestamp: new Date().toISOString(),
      };
      await updateNode(mindNode.id, { data: patchData([...updatedConv.messages, errMsg]) });
    } finally {
      setIsTyping(false);
    }
  }, [inputValue, pendingFiles, isTyping, activeConv, chatData, mindNode.id, updateNode, settings, nodes, edges]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); handleSend(); }
  }, [handleSend]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
      onDoubleClick={e => { e.stopPropagation(); setEditingNodeId(mindNode.id); }}
    >
      <NodeResizer
        minWidth={260} minHeight={320} isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0, gap: 6 }} onClick={e => e.stopPropagation()}>
        {activeConv ? (
          <>
            <button onClick={goToList} title="All conversations" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeConv.title}
            </span>
          </>
        ) : (
          <>
            <Bot size={14} color="var(--ms-accent)" />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>AI Chat</span>
            <span style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>{settings.lmstudio_model || "local"}</span>
          </>
        )}
        <button onClick={newConversation} title="New conversation"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <Plus size={13} />
        </button>
        <button onClick={e => { e.stopPropagation(); deleteNode(mindNode.id); }} title="Delete node"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#f87171"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"}>
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <AnimatePresence mode="wait">
        {!activeConv ? (
          /* ── Conversation list ─────────────────────────────────────────── */
          <motion.div key="list"
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.15 }}
            className="nowheel"
            style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }}
            onClick={e => e.stopPropagation()}
          >
            {sortedConvs.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 16 }}>
                <MessageSquare size={28} color="var(--ms-border)" strokeWidth={1.5} />
                <span style={{ fontSize: 11, color: "var(--ms-text-muted)", textAlign: "center", lineHeight: 1.5 }}>
                  No conversations yet.<br />Start a new chat.
                </span>
                <button onClick={newConversation}
                  style={{ padding: "7px 16px", background: "var(--ms-accent)", border: "none", borderRadius: 8, color: "var(--ms-bg)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <Plus size={13} /> New Chat
                </button>
              </div>
            ) : (
              sortedConvs.map(conv => (
                <div key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  onMouseEnter={() => setHoveredConvId(conv.id)}
                  onMouseLeave={() => setHoveredConvId(null)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, cursor: "pointer", background: hoveredConvId === conv.id ? "var(--ms-border)" : "transparent", transition: "background 0.1s" }}
                >
                  <MessageSquare size={11} color="var(--ms-text-muted)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {conv.title}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ms-text-muted)", marginTop: 2 }}>
                      {conv.messages.length} {conv.messages.length === 1 ? "message" : "messages"} · {relativeTime(conv.updated_at)}
                    </div>
                  </div>
                  {hoveredConvId === conv.id ? (
                    <button onClick={e => deleteConversation(conv.id, e)} title="Delete"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#f87171"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"}>
                      <Trash2 size={11} />
                    </button>
                  ) : (
                    <ChevronRight size={10} color="var(--ms-text-muted)" style={{ flexShrink: 0, opacity: 0.5 }} />
                  )}
                </div>
              ))
            )}
          </motion.div>
        ) : (
          /* ── Chat view ─────────────────────────────────────────────────── */
          <motion.div key={`chat-${activeConv.id}`}
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.15 }}
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            {/* Messages — nodrag so drag-to-select text isn't captured as a node drag */}
            <div className="nowheel nodrag"
              style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8, userSelect: "text", WebkitUserSelect: "text", cursor: "auto" }}
              onClick={e => e.stopPropagation()}
            >
              {activeConv.messages.length === 0 && !isTyping && (
                <div style={{ fontSize: 11, color: "var(--ms-text-muted)", fontStyle: "italic", textAlign: "center", marginTop: 12 }}>
                  Ask me anything, or attach a file…
                </div>
              )}
              {activeConv.messages.map(msg => {
                const isUser = msg.role === "user";
                const hovered = hoveredMsg === msg.id;
                const copied = copiedMsg === msg.id;
                const copy = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(msg.content);
                  setCopiedMsg(msg.id);
                  setTimeout(() => setCopiedMsg(id => id === msg.id ? null : id), 1500);
                };
                return (
                  <div key={msg.id}
                    style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}
                    onMouseEnter={() => setHoveredMsg(msg.id)}
                    onMouseLeave={() => setHoveredMsg(null)}
                  >
                    {/* Attachment chips / image thumbnails */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: isUser ? "flex-end" : "flex-start", maxWidth: "90%" }}>
                        {msg.attachments.map((att, i) =>
                          att.mediaType === "image" && att.thumbnail ? (
                            <img key={i} src={att.thumbnail} alt={att.name} title={att.name}
                              style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid var(--ms-border)" }} />
                          ) : (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--ms-border)", borderRadius: 6, padding: "3px 8px", fontSize: 10, color: "var(--ms-text)" }}>
                              <FileText size={11} color="var(--ms-text-muted)" />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{att.name}</span>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* Message bubble */}
                    {msg.content && msg.content !== "(attachment)" && (
                      <div style={{
                        maxWidth: "90%", padding: "7px 10px",
                        borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                        background: isUser ? "var(--ms-accent)" : "var(--ms-surface)",
                        border: isUser ? "none" : "1px solid var(--ms-border)",
                        color: isUser ? "#fff" : "var(--ms-text)",
                        fontSize: 11, lineHeight: 1.6, userSelect: "text", wordBreak: "break-word",
                      }}>
                        {isUser ? msg.content : (
                          <div className="ms-chat-md">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    )}

                    {hovered && (
                      <button onClick={copy}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", borderRadius: 4, color: copied ? "#4ade80" : "var(--ms-text-muted)", display: "flex", alignItems: "center", gap: 3, fontSize: 10, transition: "color 0.15s" }}>
                        {copied ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copied ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>
                );
              })}
              <AnimatePresence>
                {isTyping && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                    style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{ background: "var(--ms-border)", borderRadius: "10px 10px 10px 2px" }}>
                      <TypingIndicator />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Pending attachments preview */}
            {pendingFiles.length > 0 && (
              <div style={{ padding: "4px 8px", borderTop: "1px solid var(--ms-border)", display: "flex", flexWrap: "wrap", gap: 4 }}
                onClick={e => e.stopPropagation()}>
                {pendingFiles.map(f => (
                  <AttachmentChip key={f.id} attachment={f} onRemove={() => removePendingFile(f.id)} />
                ))}
              </div>
            )}

            {/* Input bar */}
            <div style={{ padding: "6px 8px", borderTop: "1px solid var(--ms-border)", display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}
              onClick={e => e.stopPropagation()}>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED}
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />

              {/* Attach button */}
              <button
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                title="Attach image or file"
                disabled={isTyping}
                style={{
                  background: "none", border: "none", cursor: isTyping ? "not-allowed" : "pointer",
                  padding: "4px", color: pendingFiles.length > 0 ? "var(--ms-accent)" : "var(--ms-text-muted)",
                  display: "flex", alignItems: "center", flexShrink: 0,
                  opacity: isTyping ? 0.4 : 1, transition: "color 0.15s",
                }}>
                <Paperclip size={13} />
              </button>

              <input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={e => e.stopPropagation()}
                placeholder={pendingFiles.length > 0 ? "Add a message… (optional)" : "Ask something…"}
                disabled={isTyping}
                style={{ flex: 1, background: "var(--ms-border)", border: "1px solid transparent", borderRadius: 6, color: "var(--ms-text)", fontSize: 11, padding: "5px 8px", outline: "none", userSelect: "text", cursor: "text" }}
              />
              <button onClick={e => { e.stopPropagation(); handleSend(); }}
                disabled={isTyping || (!inputValue.trim() && pendingFiles.length === 0)}
                style={{ padding: "5px 10px", background: "var(--ms-accent)", border: "none", borderRadius: 6, color: "var(--ms-bg)", cursor: (isTyping || (!inputValue.trim() && pendingFiles.length === 0)) ? "not-allowed" : "pointer", opacity: (isTyping || (!inputValue.trim() && pendingFiles.length === 0)) ? 0.5 : 1, transition: "opacity 0.1s", display: "flex", alignItems: "center" }}>
                <Send size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default AiChatNode;
