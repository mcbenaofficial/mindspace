import { useEffect, useRef, useState } from "react";
import { ViewportPortal } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, X } from "lucide-react";
import { MentalModel } from "../../lib/mentalModels";
import { suggestModels, dismissModelForNode, dismissedModelsForNode } from "../../lib/brain/suggestions";
import { useStore } from "../../store";
import { MindNode } from "../../types";

// Ambient suggestion chips for a single node. The hook owns the debounce and
// dismissal filtering; the tray renders through ViewportPortal so it sits in
// the canvas layer below the node — outside its bounds, unclipped, moving
// with pan/zoom for free. Declared by each trigger-eligible node component.

const DEBOUNCE_MS = 1000;
const AUTO_DISMISS_MS = 8000;

export function useModelSuggestions(nodeId: string, text: string, active: boolean) {
  const [models, setModels] = useState<MentalModel[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      // Node deselected: chips disappear immediately, pending query cancelled.
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      setModels([]);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const result = await suggestModels(text, dismissedModelsForNode(nodeId));
      // A slow embed resolving after deselection must not resurrect chips.
      if (activeRef.current) setModels(result);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [text, active, nodeId]);

  const dismiss = (modelId: string) => {
    dismissModelForNode(nodeId, modelId);
    setModels((ms) => ms.filter((m) => m.id !== modelId));
  };

  const clear = () => setModels([]);

  return { models, dismiss, clear };
}

interface ModelSuggestionChipsProps {
  sourceNode: MindNode;
  models: MentalModel[];
  onDismiss: (modelId: string) => void;
  onClear: () => void;
}

export function ModelSuggestionChips({ sourceNode, models, onDismiss, onClear }: ModelSuggestionChipsProps) {
  const { addNode, addEdge } = useStore();
  const [hovered, setHovered] = useState(false);

  // Auto-dismiss after 8s of inactivity; new suggestions reset the timer,
  // hover pauses it.
  useEffect(() => {
    if (models.length === 0 || hovered) return;
    const t = setTimeout(onClear, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [models, hovered, onClear]);

  if (models.length === 0) return null;

  const spawn = async (model: MentalModel) => {
    const created = await addNode({
      canvas_id: sourceNode.canvas_id,
      type: "mental-model",
      x: sourceNode.x + sourceNode.width + 80,
      y: sourceNode.y + 80,
      width: 320,
      height: 420,
      z_index: 0,
      locked: false,
      parent_id: null,
      data: { model_id: model.id, prompt_responses: {}, summary: "" },
    });
    await addEdge({
      canvas_id: sourceNode.canvas_id,
      source: sourceNode.id,
      target: created.id,
    });
    onClear();
  };

  return (
    <ViewportPortal>
      <div
        className="nodrag nopan"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "absolute",
          transform: `translate(${sourceNode.x}px, ${sourceNode.y + sourceNode.height + 8}px)`,
          display: "flex",
          gap: 8,
          pointerEvents: "all",
          zIndex: 10,
        }}
      >
        <AnimatePresence>
          {models.map((model) => (
            <motion.div
              key={model.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              title={model.description}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 6px 4px 10px",
                borderRadius: 99,
                fontSize: 12,
                background: "var(--ms-surface-2)",
                border: "1px solid var(--ms-border-2)",
                boxShadow: "var(--ms-shadow-md)",
                color: "var(--ms-text)",
                whiteSpace: "nowrap",
              }}
            >
              <Brain size={12} color="#EF9F27" style={{ flexShrink: 0 }} />
              <button
                onClick={(e) => { e.stopPropagation(); void spawn(model); }}
                title={model.description}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontSize: 12, color: "var(--ms-text)", fontFamily: "inherit",
                }}
              >
                {model.name}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(model.id); }}
                aria-label={`Dismiss ${model.name} suggestion`}
                style={{
                  width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  color: "var(--ms-text-muted)", borderRadius: "50%", flexShrink: 0,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
              >
                <X size={11} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ViewportPortal>
  );
}
