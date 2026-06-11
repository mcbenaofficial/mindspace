import { useState } from "react";
import {
  EdgeProps,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useStore } from "../../store";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  selected,
  markerEnd,
  style,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const { deleteEdge } = useStore();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showDelete = selected || hovered;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? "var(--ms-accent)" : "var(--ms-border)",
          strokeWidth: selected ? 2 : 1.5,
          transition: "stroke 0.15s, stroke-width 0.15s",
        }}
        interactionWidth={16}
      />

      {/* Invisible wide path to catch hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer" }}
      />

      <EdgeLabelRenderer>
        {showDelete && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteEdge(id);
              }}
              title="Delete connection"
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "var(--ms-surface)",
                border: "1px solid var(--ms-border)",
                color: "var(--ms-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                transition: "border-color 0.1s, color 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#f87171";
                (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ms-border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)";
              }}
            >
              <X size={9} />
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export default DeletableEdge;
