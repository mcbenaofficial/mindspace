import React, { useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { useCmdKey } from '../../hooks/useCmdKey';
import { motion } from "framer-motion";
import {
  Link2, ArrowRight,
  Folder, BrainCircuit, Rocket, Lightbulb, FileText, Target,
  Zap, Leaf, Globe, Wrench, Maximize2, Minimize2, Trash2,
} from "lucide-react";
import { useStore } from "../../store";
import { MindNode, ProjectHubData } from "../../types";
import { sounds } from "../../lib/sound";

const ICON_MAP: Record<string, React.ElementType> = {
  folder: Folder,
  brain: BrainCircuit,
  rocket: Rocket,
  lightbulb: Lightbulb,
  file: FileText,
  target: Target,
  zap: Zap,
  leaf: Leaf,
  globe: Globe,
  wrench: Wrench,
};

function ProjectIcon({ name, size, color }: { name: string; size: number; color?: string }) {
  const Icon = ICON_MAP[name] ?? Folder;
  return <Icon size={size} color={color} />;
}

export type ProjectHubNodeType = Node<{ mindNode: MindNode }, "project-hub">;

export function ProjectHubNode({ data, selected }: NodeProps<ProjectHubNodeType>) {
  const { mindNode } = data;
  const hubData = mindNode.data as ProjectHubData;
  const { updateNode, setEditingNodeId, projects, loadCanvases, deleteNode } = useStore();

  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(hubData.description);
  const [fullMode, setFullMode] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();

  const linkedProject = projects.find((p) => p.id === hubData.linked_project_id);

  const saveDesc = useCallback(() => {
    setEditingDesc(false);
    if (descValue !== hubData.description) {
      updateNode(mindNode.id, {
        data: { ...hubData, description: descValue },
      });
    }
  }, [descValue, hubData, mindNode.id, updateNode]);

  const handleDescKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        saveDesc();
      }
    },
    [saveDesc]
  );

  const handleProjectClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!hubData.linked_project_id) return;
      sounds.open();
      await loadCanvases(hubData.linked_project_id);
    },
    [hubData.linked_project_id, loadCanvases]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNodeId(mindNode.id);
    },
    [mindNode.id, setEditingNodeId]
  );

  const toggleFullMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullMode(v => !v);
    setTimeout(() => updateNodeInternals(mindNode.id), 0);
  }, [mindNode.id, updateNodeInternals]);

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
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        minWidth={180}
        minHeight={120}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, params) => {
          updateNode(mindNode.id, { width: params.width, height: params.height });
        }}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Link2 size={14} color="var(--ms-accent)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>
          Project Hub
        </span>
        <button
          onClick={toggleFullMode}
          title={fullMode ? "Collapse" : "Expand"}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
            color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0,
          }}
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

      {/* Body */}
      <div
        className="ms-node-body"
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, cursor: "default" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Project link */}
        <div
          onClick={handleProjectClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 6,
            background: "var(--ms-border)",
            cursor: hubData.linked_project_id ? "pointer" : "default",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => {
            if (hubData.linked_project_id) {
              (e.currentTarget as HTMLDivElement).style.background =
                "color-mix(in srgb, var(--ms-accent) 15%, var(--ms-border))";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "var(--ms-border)";
          }}
        >
          {linkedProject && (
            <ProjectIcon name={linkedProject.icon} size={14} color={linkedProject.color} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: hubData.linked_project_id ? "var(--ms-accent)" : "var(--ms-text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration: hubData.linked_project_id ? "underline" : "none",
              }}
            >
              {linkedProject ? linkedProject.name : "No project linked"}
            </div>
            <div style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>
              {hubData.linked_project_id ? "Click to navigate" : "Double-click to configure"}
            </div>
          </div>
          {hubData.linked_project_id && (
            <ArrowRight size={12} color="var(--ms-accent)" />
          )}
        </div>

        {/* Description */}
        {editingDesc ? (
          <textarea
            ref={descRef}
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={saveDesc}
            onKeyDown={handleDescKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            rows={2}
            style={{
              background: "transparent",
              border: "1px solid var(--ms-accent)",
              borderRadius: 4,
              color: "var(--ms-text)",
              fontSize: 11,
              padding: "4px 6px",
              resize: "none",
              outline: "none",
              width: "100%",
              userSelect: "text",
              cursor: "text",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setEditingDesc(true);
              setTimeout(() => descRef.current?.focus(), 0);
            }}
            style={{
              fontSize: 11,
              color: hubData.description ? "var(--ms-text)" : "var(--ms-text-muted)",
              lineHeight: 1.5,
              fontStyle: hubData.description ? "normal" : "italic",
              cursor: "text",
              userSelect: "text",
              minHeight: 28,
            }}
          >
            {hubData.description || "Add a description…"}
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

export default ProjectHubNode;
