import React, { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, STTData } from "../../types";
import { sounds } from "../../lib/sound";

export type STTNodeType = Node<{ mindNode: MindNode }, "stt">;

const BAR_COUNT = 18;
const BAR_TARGETS = [6, 18, 12, 26, 20, 32, 14, 36, 24, 30, 16, 28, 22, 34, 10, 22, 16, 8];

function WaveformPill({
  isRecording,
  isLoading,
  onClick,
}: {
  isRecording: boolean;
  isLoading: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      style={{
        width: "100%",
        background: isRecording ? "#111" : "var(--ms-text)",
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
      title={isRecording ? "Stop recording" : "Tap to record"}
    >
      {isLoading ? (
        <motion.div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }}
            />
          ))}
        </motion.div>
      ) : isRecording ? (
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
              background: "#f87171",
              borderRadius: "50%",
              width: 10,
              height: 10,
            }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.7, repeat: Infinity }}
          />
        </>
      ) : (
        Array.from({ length: BAR_COUNT }, (_, i) => (
          <div
            key={i}
            style={{ width: 3, height: 3, background: "rgba(0,0,0,0.25)", borderRadius: 2 }}
          />
        ))
      )}
    </motion.button>
  );
}

export function STTNode({ data, selected }: NodeProps<STTNodeType>) {
  const { mindNode } = data;
  const sttData = mindNode.data as STTData;
  const { updateNode, setEditingNodeId, settings, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!settings.openrouter_api_key) {
      setError("OpenRouter API key not set in Settings");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsLoading(true);
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const audio_b64 = btoa(binary);

          const transcript = await invoke<string>("transcribe_audio", {
            audiob64: audio_b64,
            mimeType,
            apiKey: settings.openrouter_api_key,
          });

          if (transcript.trim()) {
            const combined = sttData.transcript
              ? sttData.transcript + "\n" + transcript.trim()
              : transcript.trim();
            await updateNode(mindNode.id, { data: { ...sttData, transcript: combined } });
            sounds.save();
          }
        } catch (err) {
          setError((err as string) || "Transcription failed");
          sounds.error();
        } finally {
          setIsLoading(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("Microphone access denied");
    }
  }, [settings.openrouter_api_key, sttData, mindNode.id, updateNode]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [isRecording]);

  const handlePillClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isLoading) return;
      if (isRecording) stopRecording();
      else startRecording();
    },
    [isRecording, isLoading, startRecording, stopRecording]
  );

  const clearTranscript = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateNode(mindNode.id, { data: { ...sttData, transcript: "" } });
    },
    [mindNode.id, sttData, updateNode]
  );

  const hasTranscript = Boolean(sttData.transcript);

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
        minHeight={160}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, params) => updateNode(mindNode.id, { width: params.width, height: params.height })}
      />

      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0, borderRadius: "8px 8px 0 0" }} />

      <div className="ms-node-header" style={{ flexShrink: 0, paddingRight: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", flex: 1 }}>
          Transcribe
        </span>
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
        style={{ flex: 1, overflow: "hidden", position: "relative", padding: "8px 12px 4px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasTranscript ? (
          <>
            <div
              style={{
                height: "100%",
                overflowY: "auto",
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--ms-text)",
                userSelect: "text",
                paddingRight: 4,
              }}
            >
              {sttData.transcript}
            </div>
            <button
              onClick={clearTranscript}
              style={{
                position: "absolute",
                bottom: 6,
                right: 10,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--ms-text-muted)",
                display: "flex",
                alignItems: "center",
                borderRadius: 4,
                fontSize: 10,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ms-text-muted)")}
              title="Clear transcript"
            >
              Clear
            </button>
          </>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, color: "var(--ms-text-muted)", textAlign: "center", lineHeight: 1.5 }}>
              {isLoading ? "Transcribing…" : "Tap the pill to start recording"}
            </span>
          </div>
        )}
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
        <WaveformPill isRecording={isRecording} isLoading={isLoading} onClick={handlePillClick} />
        {isRecording && (
          <div style={{ textAlign: "center", fontSize: 10, color: "var(--ms-text-muted)", marginTop: 5 }}>
            Tap to stop
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

export default STTNode;
