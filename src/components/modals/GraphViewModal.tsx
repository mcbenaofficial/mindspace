import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ReactFlow, ReactFlowProvider, Background, Node, Edge } from "@xyflow/react";
import { Share2, X } from "lucide-react";
import { useStore } from "../../store";
import { getDb } from "../../lib/db";
import { jumpToNode } from "../../lib/brain/navigation";

// Read-only knowledge-graph view of the active project: canvases as columns,
// solid edges = explicit connections, dashed = accepted/semantic links.

interface GNode { id: string; title: string; canvasId: string; canvasName: string; projectId: string; }
interface GEdge { a: string; b: string; kind: "edge" | "link"; }

export function GraphViewModal() {
  const { activeProjectId, setGraphOpen } = useStore();
  const [gNodes, setGNodes] = useState<GNode[]>([]);
  const [gEdges, setGEdges] = useState<GEdge[]>([]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const nodeRows = await db.select<any[]>(
        `SELECT n.id, n.canvas_id, c.name AS canvas_name, c.project_id,
                COALESCE(s.title, '') AS title
         FROM nodes n
         JOIN canvases c ON c.id = n.canvas_id
         LEFT JOIN search_index s ON s.node_id = n.id
         WHERE c.project_id = ? AND n.type NOT IN ('group', 'divider')
         LIMIT 400`,
        [activeProjectId]
      ).catch(() => [] as any[]);
      const ids = new Set(nodeRows.map((r) => r.id));

      const edgeRows = await db.select<any[]>(
        `SELECT e.source, e.target FROM edges e JOIN canvases c ON c.id = e.canvas_id WHERE c.project_id = ?`,
        [activeProjectId]
      ).catch(() => [] as any[]);
      const linkRows = await db.select<any[]>(`SELECT a_node, b_node FROM links`).catch(() => [] as any[]);

      if (cancelled) return;
      setGNodes(nodeRows.map((r) => ({
        id: r.id, title: r.title || "(untitled)", canvasId: r.canvas_id,
        canvasName: r.canvas_name, projectId: r.project_id,
      })));
      const edges: GEdge[] = [];
      for (const e of edgeRows) if (ids.has(e.source) && ids.has(e.target)) edges.push({ a: e.source, b: e.target, kind: "edge" });
      for (const l of linkRows) if (ids.has(l.a_node) && ids.has(l.b_node)) edges.push({ a: l.a_node, b: l.b_node, kind: "link" });
      setGEdges(edges);
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  const { rfNodes, rfEdges } = useMemo(() => {
    const byCanvas = new Map<string, GNode[]>();
    for (const n of gNodes) {
      const arr = byCanvas.get(n.canvasId) ?? [];
      arr.push(n);
      byCanvas.set(n.canvasId, arr);
    }
    const canvases = [...byCanvas.entries()];
    const rfNodes: Node[] = [];
    canvases.forEach(([canvasId, members], col) => {
      rfNodes.push({
        id: `canvas-${canvasId}`,
        position: { x: col * 300, y: 0 },
        data: { label: members[0]?.canvasName ?? "Canvas" },
        draggable: false, selectable: false,
        style: {
          background: "transparent", border: "none", color: "var(--ms-accent)",
          fontSize: 13, fontWeight: 700, width: 240, textAlign: "center" as const,
        },
      });
      members.forEach((m, i) => {
        rfNodes.push({
          id: m.id,
          position: { x: col * 300, y: 50 + i * 56 },
          data: { label: m.title.slice(0, 36) },
          style: {
            background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
            borderRadius: 9, color: "var(--ms-text)", fontSize: 11,
            width: 240, padding: "8px 10px",
          },
        });
      });
    });
    const seen = new Set<string>();
    const rfEdges: Edge[] = [];
    gEdges.forEach((e, i) => {
      const key = [e.a, e.b].sort().join("|") + e.kind;
      if (seen.has(key)) return;
      seen.add(key);
      rfEdges.push({
        id: `ge-${i}`, source: e.a, target: e.b,
        style: e.kind === "link"
          ? { stroke: "var(--ms-accent)", strokeDasharray: "5 4", opacity: 0.6 }
          : { stroke: "var(--ms-text-muted)", opacity: 0.5 },
      });
    });
    return { rfNodes, rfEdges };
  }, [gNodes, gEdges]);

  const handleNodeClick = (_: unknown, node: Node) => {
    if (node.id.startsWith("canvas-")) return;
    const meta = gNodes.find((n) => n.id === node.id);
    if (!meta) return;
    setGraphOpen(false);
    jumpToNode(meta.id, meta.canvasId, meta.projectId);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={() => setGraphOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 1050, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1100px, 94vw)", height: "min(740px, 90vh)",
          background: "var(--ms-bg)", border: "1px solid var(--ms-border)",
          borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 32px 90px rgba(0,0,0,0.65)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid var(--ms-border)", flexShrink: 0 }}>
          <Share2 size={15} color="var(--ms-accent)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ms-text)", flex: 1 }}>Knowledge Graph</span>
          <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>
            {gNodes.length} nodes · solid = connected · dashed = related
          </span>
          <button onClick={() => setGraphOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", display: "flex", marginLeft: 8 }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ flex: 1 }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodeClick={handleNodeClick}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.1}
              nodesConnectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} color="rgba(255,255,255,0.05)" />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </motion.div>
    </motion.div>
  );
}
