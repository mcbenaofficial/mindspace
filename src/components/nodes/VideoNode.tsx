import React, { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  PlayCircle, Maximize2, Minimize2, Trash2,
  Play, Pause, Volume2, VolumeX, Repeat, Maximize, Upload, Link2,
  AlertCircle,
} from "lucide-react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { useStore } from "../../store";
import { MindNode, VideoData } from "../../types";

export type VideoNodeType = Node<{ mindNode: MindNode }, "video">;

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

function fmtTime(secs: number): string {
  if (!secs || !isFinite(secs)) return "0:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}` : `${m}:${s.toString().padStart(2,"0")}`;
}

export function VideoNode({ data, selected }: NodeProps<VideoNodeType>) {
  const { mindNode } = data;
  const videoData = mindNode.data as unknown as VideoData;
  const { updateNode, setEditingNodeId, deleteNode } = useStore();
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();

  // Video element state
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [fullMode, setFullMode] = useState(false);
  const [srcError, setSrcError] = useState(false);

  // Source input state
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  const hasSource = !!videoData.src;

  // ── Sync video state → React state ──────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay   = () => setPlaying(true);
    const onPause  = () => setPlaying(false);
    const onTime   = () => setCurrentTime(v.currentTime);
    const onMeta   = () => setDuration(v.duration);
    const onVol    = () => { setVolume(v.volume); setMuted(v.muted); };
    const onProg   = () => { if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)); };
    const onErr    = () => setSrcError(true);
    const onLoaded = () => setSrcError(false);

    v.addEventListener("play",        onPlay);
    v.addEventListener("pause",       onPause);
    v.addEventListener("timeupdate",  onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("progress",    onProg);
    v.addEventListener("error",       onErr);
    v.addEventListener("loadeddata",  onLoaded);

    return () => {
      v.removeEventListener("play",        onPlay);
      v.removeEventListener("pause",       onPause);
      v.removeEventListener("timeupdate",  onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("progress",    onProg);
      v.removeEventListener("error",       onErr);
      v.removeEventListener("loadeddata",  onLoaded);
    };
  }, [videoData.src]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  }, []);

  const toggleLoop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLoop(l => {
      if (videoRef.current) videoRef.current.loop = !l;
      return !l;
    });
  }, []);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value;
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
  }, []);

  const handleSpeed = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const s = +e.target.value;
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  }, []);

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    videoRef.current?.requestFullscreen?.();
  }, []);

  // Progress scrub
  const scrubbing = useRef(false);
  const doSeek = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }, [duration]);

  const handleProgressDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    scrubbing.current = true;
    doSeek(e.clientX);
    const onMove = (ev: MouseEvent) => { if (scrubbing.current) doSeek(ev.clientX); };
    const onUp = () => { scrubbing.current = false; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [doSeek]);

  // ── Source management ──────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const src = URL.createObjectURL(file);
    setSrcError(false);
    await updateNode(mindNode.id, { data: { ...videoData, src, fileName: file.name, srcType: "file" } });
  }, [videoData, mindNode.id, updateNode]);

  const handleUrlSubmit = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    const src = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    setSrcError(false);
    await updateNode(mindNode.id, { data: { ...videoData, src, fileName: src, srcType: "url" } });
    setShowUrlInput(false);
    setUrlInput("");
  }, [urlInput, videoData, mindNode.id, updateNode]);

  const clearSource = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoData.srcType === "file" && videoData.src.startsWith("blob:")) {
      URL.revokeObjectURL(videoData.src);
    }
    setPlaying(false);
    setCurrentTime(0); setDuration(0);
    setSrcError(false);
    await updateNode(mindNode.id, { data: { ...videoData, src: "", fileName: "", srcType: "" } });
  }, [videoData, mindNode.id, updateNode]);

  const toggleFullMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullMode(v => !v);
    setTimeout(() => updateNodeInternals(mindNode.id), 0);
  }, [mindNode.id, updateNodeInternals]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  // Icon button style
  const iconBtn = (active?: boolean): React.CSSProperties => ({
    background: "none", border: "none", cursor: "pointer", padding: "3px 5px",
    color: active ? "var(--ms-accent)" : "rgba(255,255,255,0.75)",
    display: "flex", alignItems: "center", borderRadius: 5,
    transition: "color 0.12s",
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: fullMode ? "auto" : mindNode.height, display: "flex", flexDirection: "column" }}
      onDoubleClick={e => { e.stopPropagation(); setEditingNodeId(mindNode.id); }}
    >
      <NodeResizer
        minWidth={260} minHeight={200} isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0, gap: 7 }}>
        <PlayCircle size={14} color="#3b82f6" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {videoData.fileName ? videoData.fileName.replace(/^.+\//, "") : "Video"}
        </span>
        {hasSource && (
          <span style={{ fontSize: 9, fontWeight: 700, color: videoData.srcType === "file" ? "#8b5cf6" : "#3b82f6", background: videoData.srcType === "file" ? "#8b5cf618" : "#3b82f618", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.06em", flexShrink: 0 }}>
            {videoData.srcType === "file" ? "FILE" : "URL"}
          </span>
        )}
        {hasSource && (
          <button onClick={clearSource} title="Remove source" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}>
            <Minimize2 size={11} />
          </button>
        )}
        <button onClick={toggleFullMode} title={fullMode ? "Collapse" : "Expand"} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}>
          {fullMode ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button onClick={e => { e.stopPropagation(); deleteNode(mindNode.id); }} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}>
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <div className="nodrag nopan nowheel" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: fullMode ? 260 : undefined }}>
        <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleFileChange} />

        {!hasSource ? (
          /* ── Source picker ── */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
            {/* File drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f) { const src = URL.createObjectURL(f); updateNode(mindNode.id, { data: { ...videoData, src, fileName: f.name, srcType: "file" } }); } }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 7, borderRadius: 10, cursor: "pointer",
                border: "1.5px dashed rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.14)",
                boxShadow: "inset -2px -2px 6px var(--nm-light), inset 2px 2px 6px var(--nm-dark)",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.1)"; }}
            >
              <Upload size={24} color="#3b82f6" style={{ opacity: 0.6 }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ms-text)" }}>Add a video</div>
                <div style={{ fontSize: 10, color: "var(--ms-text-muted)", marginTop: 2 }}>MP4 · WebM · MOV · OGG</div>
              </div>
              <div style={{ fontSize: 9, letterSpacing: "0.08em", color: "var(--ms-text-muted)" }}>CLICK OR DROP</div>
            </div>

            {/* URL input */}
            {showUrlInput ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleUrlSubmit(); e.stopPropagation(); }}
                  placeholder="https://example.com/video.mp4"
                  autoFocus
                  style={{ flex: 1, background: "var(--ms-bg)", border: "none", borderRadius: 7, color: "var(--ms-text)", fontSize: 11, padding: "6px 9px", outline: "none" }}
                />
                <button onClick={handleUrlSubmit} style={{ padding: "6px 10px", background: "#3b82f6", border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Go</button>
                <button onClick={() => setShowUrlInput(false)} style={{ padding: "6px 8px", background: "var(--ms-border)", border: "none", borderRadius: 7, color: "var(--ms-text-muted)", cursor: "pointer", fontSize: 11 }}>✕</button>
              </div>
            ) : (
              <button
                onClick={() => setShowUrlInput(true)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "var(--ms-text-muted)", cursor: "pointer", fontSize: 11 }}
              >
                <Link2 size={12} /> Paste video URL
              </button>
            )}
          </div>
        ) : (
          /* ── Player ── */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#000", position: "relative" }}>

            {/* Video element */}
            <div
              style={{ flex: 1, position: "relative", cursor: "pointer", minHeight: 0 }}
              onClick={togglePlay}
            >
              <video
                ref={videoRef}
                src={videoData.src}
                loop={loop}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />

              {/* Error state */}
              {srcError && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(0,0,0,0.85)" }}>
                  <AlertCircle size={22} color="#f87171" />
                  <span style={{ fontSize: 11, color: "#f87171", textAlign: "center", padding: "0 16px" }}>
                    {videoData.srcType === "file" ? "Session ended — re-attach the file" : "Video failed to load"}
                  </span>
                  <button onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }} style={{ padding: "5px 12px", background: "#3b82f6", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                    {videoData.srcType === "file" ? "Re-attach file" : "Try again"}
                  </button>
                </div>
              )}

              {/* Centre play icon (shown when paused & not error) */}
              {!playing && !srcError && duration > 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
                    <Play size={20} color="#fff" style={{ marginLeft: 2 }} />
                  </div>
                </div>
              )}
            </div>

            {/* Controls bar */}
            <div style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.92))", padding: "10px 10px 8px", flexShrink: 0 }}>

              {/* Progress bar */}
              <div
                ref={progressRef}
                onMouseDown={handleProgressDown}
                style={{ height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, cursor: "pointer", marginBottom: 8, position: "relative" }}
              >
                {/* Buffer */}
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${bufPct}%`, background: "rgba(255,255,255,0.2)", borderRadius: 2 }} />
                {/* Progress */}
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${progress}%`, background: "#3b82f6", borderRadius: 2, transition: scrubbing.current ? "none" : "width 0.1s" }} />
                {/* Thumb */}
                <div style={{ position: "absolute", top: "50%", left: `${progress}%`, transform: "translate(-50%, -50%)", width: 10, height: 10, borderRadius: "50%", background: "#fff", boxShadow: "0 0 4px rgba(0,0,0,0.5)", pointerEvents: "none" }} />
              </div>

              {/* Controls row */}
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                {/* Play/Pause */}
                <button onClick={togglePlay} style={iconBtn()}>
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                </button>

                {/* Time */}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", marginLeft: 2, marginRight: 4, fontVariantNumeric: "tabular-nums" }}>
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>

                <div style={{ flex: 1 }} />

                {/* Volume */}
                <button onClick={toggleMute} style={iconBtn(muted)}>
                  {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
                  onChange={handleVolume}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ width: 52, accentColor: "#3b82f6", cursor: "pointer" }}
                />

                {/* Speed */}
                <select
                  value={speed}
                  onChange={handleSpeed}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 4, color: "rgba(255,255,255,0.75)", fontSize: 10, padding: "2px 2px", cursor: "pointer", marginLeft: 4 }}
                >
                  {SPEEDS.map(s => <option key={s} value={s}>{s}x</option>)}
                </select>

                {/* Loop */}
                <button onClick={toggleLoop} title="Loop" style={iconBtn(loop)}>
                  <Repeat size={12} />
                </button>

                {/* Fullscreen */}
                <button onClick={handleFullscreen} title="Fullscreen" style={iconBtn()}>
                  <Maximize size={12} />
                </button>
              </div>
            </div>
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

export default VideoNode;
