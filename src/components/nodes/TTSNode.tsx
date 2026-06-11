import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, TTSData } from "../../types";
import { sounds } from "../../lib/sound";

export type TTSNodeType = Node<{ mindNode: MindNode }, "tts">;

const BAR_COUNT = 18;
const BAR_TARGETS = [6, 18, 12, 26, 20, 32, 14, 36, 24, 30, 16, 28, 22, 34, 10, 22, 16, 8];

const VOICES = ["Samantha", "Alex", "Victoria", "Allison", "Ava", "Nicky", "Tom", "Daniel"] as const;


function SpeakPill({
  isPlaying,
  isLoading,
  onClick,
}: {
  isPlaying: boolean;
  isLoading: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      style={{
        width: "100%",
        background: isPlaying ? "var(--ms-accent)" : "var(--ms-text)",
        border: "none",
        borderRadius: 999,
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        cursor: "pointer",
        height: 52,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
      title={isPlaying ? "Stop playback" : "Speak text"}
    >
      {isLoading ? (
        <motion.div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: isPlaying ? "white" : "rgba(0,0,0,0.5)" }}
            />
          ))}
        </motion.div>
      ) : isPlaying ? (
        <>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <motion.div
              key={i}
              animate={{ height: [3, BAR_TARGETS[i], 3] }}
              transition={{
                duration: 0.35 + (i % 4) * 0.1,
                repeat: Infinity,
                repeatType: "mirror",
                delay: i * 0.04,
                ease: "easeInOut",
              }}
              style={{ width: 3, background: "white", borderRadius: 2, minHeight: 3 }}
            />
          ))}
          <motion.div
            style={{
              position: "absolute",
              right: 14,
              background: "rgba(255,255,255,0.6)",
              borderRadius: "50%",
              width: 10,
              height: 10,
            }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.7, repeat: Infinity }}
          />
        </>
      ) : (
        <>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <div
              key={i}
              style={{ width: 3, height: 3, background: "rgba(0,0,0,0.25)", borderRadius: 2 }}
            />
          ))}
        </>
      )}
    </motion.button>
  );
}

export function TTSNode({ data, selected }: NodeProps<TTSNodeType>) {
  const { mindNode } = data;
  const ttsData = mindNode.data as TTSData;
  const { updateNode, setEditingNodeId, settings, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSpeak = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!ttsData.text.trim() || isLoading) return;
      if (isPlaying && audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
        return;
      }

      setError(null);
      setIsLoading(true);
      try {
        const b64 = await invoke<string>("synthesize_speech", {
          text: ttsData.text,
          voice: ttsData.voice || "Samantha",
        });
        const url = `data:audio/aiff;base64,${b64}`;

        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        setIsPlaying(true);
        await audio.play();
      } catch (err) {
        setError((err as Error).message);
        setIsPlaying(false);
        sounds.error();
      } finally {
        setIsLoading(false);
      }
    },
    [ttsData.text, ttsData.voice, isLoading, isPlaying, settings.openrouter_api_key]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNode(mindNode.id, { data: { ...ttsData, text: e.target.value } });
    },
    [mindNode.id, ttsData, updateNode]
  );

  const handleVoiceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNode(mindNode.id, { data: { ...ttsData, voice: e.target.value } });
    },
    [mindNode.id, ttsData, updateNode]
  );

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
      onDoubleClick={(e) => { e.stopPropagation(); setEditingNodeId(mindNode.id); }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={180}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, params) => updateNode(mindNode.id, { width: params.width, height: params.height })}
      />

      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0, borderRadius: "8px 8px 0 0" }} />

      <div className="ms-node-header" style={{ flexShrink: 0, paddingRight: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", flex: 1 }}>
          Read Aloud
        </span>
        <select
          value={ttsData.voice || "alloy"}
          onChange={handleVoiceChange}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--ms-surface)",
            border: "1px solid var(--ms-border)",
            borderRadius: 6,
            color: "var(--ms-text-muted)",
            fontSize: 10,
            padding: "2px 4px",
            cursor: "pointer",
            marginRight: 6,
            outline: "none",
          }}
        >
          {VOICES.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ms-text-muted)")}
        >
          <Trash2 size={11} />
        </button>
      </div>

      <div
        style={{ flex: 1, overflow: "hidden", padding: "6px 10px 4px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <textarea
          value={ttsData.text}
          onChange={handleTextChange}
          placeholder="Type or paste text to read aloud…"
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--ms-text)",
            fontFamily: "inherit",
          }}
        />
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ padding: "2px 12px", fontSize: 10, color: "#f87171", flexShrink: 0 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{ padding: "6px 10px 10px", flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <SpeakPill isPlaying={isPlaying} isLoading={isLoading} onClick={handleSpeak} />
        {!ttsData.text.trim() && !isPlaying && (
          <div style={{ textAlign: "center", fontSize: 10, color: "var(--ms-text-muted)", marginTop: 5 }}>
            Enter text above then tap to speak
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

export default TTSNode;
