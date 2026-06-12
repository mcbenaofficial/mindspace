import { getDb, generateId } from "./db";
import { useStore } from "../store";
import { MindEdge } from "../types";

interface CanvasExport {
  format: "mindspace-canvas";
  version: 1;
  exported_at: string;
  canvas: { name: string; viewport_x: number; viewport_y: number; zoom: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: any[];
  edges: MindEdge[];
}

// Reads straight from SQLite — the store only holds the active canvas.
export async function exportCanvas(canvasId: string): Promise<void> {
  const db = await getDb();
  const canvas = useStore.getState().canvases.find((c) => c.id === canvasId);
  if (!canvas) throw new Error("Canvas not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes = await db.select<any[]>("SELECT * FROM nodes WHERE canvas_id = ?", [canvasId]);
  const edges = await db.select<MindEdge[]>("SELECT * FROM edges WHERE canvas_id = ?", [canvasId]);

  const payload: CanvasExport = {
    format: "mindspace-canvas",
    version: 1,
    exported_at: new Date().toISOString(),
    canvas: { name: canvas.name, viewport_x: canvas.viewport_x, viewport_y: canvas.viewport_y, zoom: canvas.zoom },
    nodes: nodes.map((n) => ({ ...n, data: JSON.parse(n.data), locked: !!n.locked })),
    edges,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${canvas.name.replace(/[^\w\- ]+/g, "").trim() || "canvas"}.mindspace.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Imports as a NEW canvas with regenerated ids (no merging into existing canvases).
export async function importCanvas(file: File, projectId: string): Promise<string> {
  const text = await file.text();
  const payload = JSON.parse(text) as CanvasExport;
  if (payload.format !== "mindspace-canvas" || !Array.isArray(payload.nodes)) {
    throw new Error("Not a MindSpace canvas export file");
  }

  const store = useStore.getState();
  const canvas = await store.createCanvas(projectId, payload.canvas?.name || "Imported canvas");
  if (payload.canvas) {
    await store.updateCanvas(canvas.id, {
      viewport_x: payload.canvas.viewport_x ?? 0,
      viewport_y: payload.canvas.viewport_y ?? 0,
      zoom: payload.canvas.zoom ?? 1,
    });
  }

  const idMap = new Map<string, string>();
  for (const n of payload.nodes) idMap.set(n.id, generateId());
  const now = new Date().toISOString();

  const db = await getDb();
  // No raw BEGIN/COMMIT — the SQL plugin's pool can split a transaction
  // across connections and abort it. The canvas row already exists, so a
  // mid-import failure just yields a partially filled canvas (nodes land
  // before the edges that reference them), never dangling references.
  for (const n of payload.nodes) {
    await db.execute(
      "INSERT INTO nodes (id, canvas_id, type, x, y, width, height, z_index, locked, parent_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        idMap.get(n.id), canvas.id, n.type, n.x, n.y, n.width, n.height,
        n.z_index ?? 0, n.locked ? 1 : 0,
        n.parent_id ? idMap.get(n.parent_id) ?? null : null,
        JSON.stringify(n.data ?? {}), n.created_at ?? now, now,
      ]
    );
  }
  for (const e of payload.edges ?? []) {
    const source = idMap.get(e.source);
    const target = idMap.get(e.target);
    if (!source || !target) continue;
    await db.execute(
      "INSERT INTO edges (id, canvas_id, source, target) VALUES (?, ?, ?, ?)",
      [generateId(), canvas.id, source, target]
    );
  }

  store.setActiveCanvas(canvas.id);
  return canvas.id;
}
