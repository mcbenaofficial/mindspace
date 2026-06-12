import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Brain, ArrowLeftRight, Trash2, Bold, Italic, List, Sparkles, Square } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, MentalModelData } from "../../types";
import { MentalModel, getModelById } from "../../lib/mentalModels";
import LensPicker from "../LensPicker";
import { streamChatCompletion, StreamHandle } from "../../lib/aiStream";
import { useModelSuggestions, ModelSuggestionChips } from "../canvas/ModelSuggestionChips";

export type MentalModelNodeType = Node<{ mindNode: MindNode }, "mental-model">;

const BADGE_LABELS: Record<string, string> = {
  management: "Management",
  career: "Career",
  thinking: "Thinking",
};

function summaryDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
  };
}

export function MentalModelNode({ data, selected }: NodeProps<MentalModelNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as MentalModelData;
  const { updateNode, deleteNode, settings } = useStore();
  const cmdDown = useCmdKey();

  const [model, setModel] = useState<MentalModel | null>(null);
  const [modelMissing, setModelMissing] = useState(false);
  const [responses, setResponses] = useState<Record<string, string>>(d.prompt_responses || {});
  const [swapPickerOpen, setSwapPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summarising, setSummarising] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const streamRef = useRef<StreamHandle | null>(null);

  // Latest persisted data — blur/stream handlers must never spread a stale snapshot.
  const dRef = useRef(d);
  useEffect(() => { dRef.current = d; }, [d]);

  // Ambient model suggestions on the prompt responses being typed.
  const sugg = useModelSuggestions(mindNode.id, Object.values(responses).join(" "), !!selected);

  useEffect(() => {
    let cancelled = false;
    setModelMissing(false);
    if (!d.model_id) { setModel(null); return; }
    getModelById(d.model_id).then((m) => {
      if (cancelled) return;
      if (m) setModel(m);
      else { setModel(null); setModelMissing(true); }
    }).catch(() => { if (!cancelled) setModelMissing(true); });
    return () => { cancelled = true; };
  }, [d.model_id]);

  // Reset local response drafts when the model changes (spawn pick or swap).
  useEffect(() => { setResponses(dRef.current.prompt_responses || {}); }, [d.model_id]);

  useEffect(() => () => { streamRef.current?.stop(); }, []);

  const persistResponses = useCallback((next: Record<string, string>) => {
    updateNode(mindNode.id, { data: { ...dRef.current, prompt_responses: next } });
  }, [mindNode.id, updateNode]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Distil your conclusion here." }),
    ],
    content: (() => {
      try { return d.summary ? JSON.parse(d.summary) : ""; } catch { return d.summary || ""; }
    })(),
    onBlur({ editor }) {
      const json = JSON.stringify(editor.getJSON());
      if (json !== dRef.current.summary) {
        updateNode(mindNode.id, { data: { ...dRef.current, summary: json } });
      }
    },
  });

  // Sync genuinely external summary changes (e.g. swap clearing it) into the
  // editor; skipped while a stream is writing so deltas aren't clobbered.
  useEffect(() => {
    if (!editor || summarising) return;
    const current = JSON.stringify(editor.getJSON());
    if ((d.summary || "") === current) return;
    try {
      editor.commands.setContent(d.summary ? JSON.parse(d.summary) : "");
    } catch {
      editor.commands.setContent(d.summary || "");
    }
  }, [d.summary, editor, summarising]);

  const applyModel = useCallback((m: MentalModel | null) => {
    if (!m) return;
    updateNode(mindNode.id, {
      data: { model_id: m.id, prompt_responses: {}, summary: "" },
    });
    setResponses({});
    setSwapPickerOpen(false);
    setConfirmOpen(false);
    setAiError(null);
    editor?.commands.setContent("");
  }, [mindNode.id, updateNode, editor]);

  const hasContent =
    Object.values(responses).some((v) => v.trim().length > 0) ||
    Object.values(d.prompt_responses || {}).some((v) => v.trim().length > 0);

  const handleSwapClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setAiError(null);
    if (hasContent || (d.summary && d.summary.length > 0)) setConfirmOpen(true);
    else setSwapPickerOpen(true);
  }, [hasContent, d.summary]);

  const summarise = useCallback(async () => {
    if (!model || summarising || !editor) return;
    setSummarising(true);
    setAiError(null);
    try {
      const qa = model.prompts
        .map((q, i) => ({ q, a: (responses[String(i)] || "").trim() }))
        .filter((p) => p.a)
        .map((p) => `Q: ${p.q}\nA: ${p.a}`)
        .join("\n\n");
      const url = (settings.lmstudio_url || "http://127.0.0.1:1234") + "/v1/chat/completions";
      const handle = streamChatCompletion({
        url,
        body: {
          model: settings.lmstudio_model || "local-model",
          messages: [
            {
              role: "system",
              content:
                `The user worked through the "${model.name}" mental model (${model.description}). ` +
                `Synthesise their answers below into a single concise paragraph that distils their conclusion. ` +
                `Reply with the paragraph only — no preamble, no headings, no bullet points.`,
            },
            { role: "user", content: qa },
          ],
          temperature: 0.7,
          max_tokens: 300,
        },
        onDelta: (full) => editor.commands.setContent(summaryDoc(full)),
      });
      streamRef.current = handle;
      const full = await handle.promise;
      const json = JSON.stringify(summaryDoc(full.trim()));
      editor.commands.setContent(summaryDoc(full.trim()));
      updateNode(mindNode.id, { data: { ...dRef.current, summary: json } });
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      streamRef.current = null;
      setSummarising(false);
    }
  }, [model, summarising, editor, responses, settings, mindNode.id, updateNode]);

  const iconBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
    color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0,
  };

  const toolbarBtn = (active: boolean): React.CSSProperties => ({
    padding: "2px 6px", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center",
    background: active ? "color-mix(in srgb, var(--ms-accent) 20%, transparent)" : "transparent",
    color: active ? "var(--ms-accent)" : "var(--ms-text-muted)",
    border: active ? "1px solid color-mix(in srgb, var(--ms-accent) 40%, transparent)" : "1px solid transparent",
  });

  // ── Spawn state: no model chosen yet — picker only; dismissal removes the node ──
  if (!d.model_id) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className={`ms-node${selected ? " selected" : ""}`}
        style={{ width: mindNode.width, display: "flex", flexDirection: "column" }}
      >
        <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />
        <div className="ms-node-header" style={{ flexShrink: 0 }}>
          <Brain size={14} color="var(--ms-accent)" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>
            Choose a mental model
          </span>
        </div>
        <div style={{ padding: 8 }}>
          <LensPicker
            value={null}
            onChange={applyModel}
            onClose={() => deleteNode(mindNode.id)}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column", position: "relative" }}
    >
      <NodeResizer
        minWidth={260}
        minHeight={280}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0, gap: 6 }}>
        <Brain size={14} color="var(--ms-accent)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {model ? model.name : modelMissing ? "Model missing" : "Loading…"}
        </span>
        {model && (
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
            color: "var(--ms-text-muted)", background: "color-mix(in srgb, var(--ms-text-muted) 12%, transparent)",
            padding: "2px 6px", borderRadius: 99, flexShrink: 0,
          }}>
            {BADGE_LABELS[model.category] || model.category}
          </span>
        )}
        <button className="nodrag nopan" onClick={handleSwapClick} title="Change model" style={iconBtn}>
          <ArrowLeftRight size={11} />
        </button>
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          title="Delete"
          style={iconBtn}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Swap confirmation */}
      {confirmOpen && (
        <div className="nodrag nopan" style={{
          margin: "6px 12px 0", padding: "8px 10px", borderRadius: 8, flexShrink: 0,
          background: "var(--ms-surface-2)", border: "1px solid var(--ms-border-2)",
        }}>
          <div style={{ fontSize: 11, color: "var(--ms-text)", marginBottom: 6 }}>
            Changing the model will clear your responses.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); setSwapPickerOpen(true); }}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "var(--ms-accent)", color: "var(--ms-bg)", fontWeight: 600 }}
            >
              Continue
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); }}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", background: "none", border: "1px solid var(--ms-border-2)", color: "var(--ms-text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Swap picker (dismissal here just closes — the node keeps its model) */}
      {swapPickerOpen && (
        <div className="nodrag nopan" style={{ position: "absolute", top: 34, right: 8, zIndex: 30 }}>
          <LensPicker value={model} onChange={applyModel} onClose={() => setSwapPickerOpen(false)} />
        </div>
      )}

      {/* Body */}
      <div className="ms-node-body nowheel" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, cursor: "default" }}>
        {modelMissing && (
          <div style={{ fontSize: 12, color: "var(--ms-text-muted)", fontStyle: "italic" }}>
            This model is no longer in the library. Use the swap button to pick another.
          </div>
        )}

        {model && model.prompts.map((prompt, i) => {
          const key = String(i);
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ms-text-muted)", lineHeight: 1.4 }}>
                {prompt}
              </label>
              <textarea
                className="nodrag nopan"
                value={responses[key] || ""}
                onChange={(e) => setResponses((r) => ({ ...r, [key]: e.target.value }))}
                onBlur={() => persistResponses({ ...dRef.current.prompt_responses, ...responses })}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                rows={2}
                style={{
                  width: "100%", resize: "vertical", minHeight: 38,
                  background: "color-mix(in srgb, var(--ms-text-muted) 6%, transparent)",
                  border: "1px solid var(--ms-border)", borderRadius: 6,
                  padding: "6px 8px", fontSize: 12, lineHeight: 1.5,
                  color: "var(--ms-text)", fontFamily: "inherit", outline: "none",
                  cursor: "text", userSelect: "text",
                }}
              />
            </div>
          );
        })}

        {model && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--ms-text-muted)" }}>Summary</span>
              <button className="nodrag nopan" onClick={(e) => { e.stopPropagation(); editor?.chain().focus().toggleBold().run(); }} title="Bold" style={toolbarBtn(!!editor?.isActive("bold"))}>
                <Bold size={11} />
              </button>
              <button className="nodrag nopan" onClick={(e) => { e.stopPropagation(); editor?.chain().focus().toggleItalic().run(); }} title="Italic" style={toolbarBtn(!!editor?.isActive("italic"))}>
                <Italic size={11} />
              </button>
              <button className="nodrag nopan" onClick={(e) => { e.stopPropagation(); editor?.chain().focus().toggleBulletList().run(); }} title="Bullet list" style={toolbarBtn(!!editor?.isActive("bulletList"))}>
                <List size={11} />
              </button>
            </div>
            <div
              className="nodrag nopan"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                minHeight: 64, borderRadius: 6, padding: "6px 8px", cursor: "text",
                background: "color-mix(in srgb, var(--ms-text-muted) 6%, transparent)",
                border: "1px solid var(--ms-border)", fontSize: 12, userSelect: "text",
              }}
            >
              <EditorContent editor={editor} />
            </div>

            {hasContent && (
              <button
                className="nodrag nopan"
                onClick={(e) => { e.stopPropagation(); if (summarising) streamRef.current?.stop(); else void summarise(); }}
                style={{
                  alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5,
                  fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                  background: "color-mix(in srgb, var(--ms-accent) 14%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--ms-accent) 35%, transparent)",
                  color: "var(--ms-accent)",
                }}
              >
                {summarising ? <Square size={10} /> : <Sparkles size={11} />}
                {summarising ? "Stop" : "Summarise with AI"}
              </button>
            )}

            {aiError && (
              <div style={{ fontSize: 10, color: "#f87171" }}>{aiError}</div>
            )}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <ModelSuggestionChips sourceNode={mindNode} models={sugg.models} onDismiss={sugg.dismiss} onClear={sugg.clear} />
    </motion.div>
  );
}

export default MentalModelNode;
