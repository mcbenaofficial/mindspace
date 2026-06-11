import { StateCreator } from "zustand";
import { Canvas, MindEdge, MindNode, Project } from "../../types";
import { getDb, generateId } from "../../lib/db";
import {
  initSearchIndex,
  upsertNodeIndex,
  removeNodeIndex,
  removeCanvasIndex,
  removeProjectIndex,
} from "../../lib/search";
import type { AppState } from "../index";

export interface DataSlice {
  projects: Project[];
  canvases: Canvas[];
  nodes: MindNode[];
  edges: MindEdge[];
  activeProjectId: string | null;
  activeCanvasId: string | null;

  init: () => Promise<void>;
  loadProjects: () => Promise<void>;
  loadCanvases: (projectId: string) => Promise<void>;
  loadCanvas: (canvasId: string) => Promise<void>;
  setActiveCanvas: (canvasId: string) => void;

  createProject: (name: string, color: string, icon: string) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  createCanvas: (projectId: string, name: string) => Promise<Canvas>;
  updateCanvas: (id: string, updates: Partial<Canvas>) => Promise<void>;
  deleteCanvas: (id: string) => Promise<void>;

  addNode: (node: Omit<MindNode, "id" | "created_at" | "updated_at">) => Promise<MindNode>;
  updateNode: (id: string, updates: Partial<MindNode>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  restoreNode: (node: MindNode) => Promise<void>;

  addEdge: (edge: Omit<MindEdge, "id">) => Promise<MindEdge>;
  deleteEdge: (id: string) => Promise<void>;
  restoreEdge: (edge: MindEdge) => Promise<void>;
}

const NODE_INSERT_SQL =
  "INSERT INTO nodes (id, canvas_id, type, x, y, width, height, z_index, locked, parent_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

function nodeInsertParams(node: MindNode) {
  return [
    node.id, node.canvas_id, node.type, node.x, node.y, node.width, node.height,
    node.z_index, node.locked ? 1 : 0, node.parent_id ?? null,
    JSON.stringify(node.data), node.created_at, node.updated_at,
  ];
}

export const createDataSlice: StateCreator<AppState, [], [], DataSlice> = (set, get) => ({
  projects: [],
  canvases: [],
  nodes: [],
  edges: [],
  activeProjectId: null,
  activeCanvasId: null,

  init: async () => {
    await get().loadSettings();
    await get().loadProjects();
    initSearchIndex().catch((err) => console.warn("Search index init failed:", err));
  },

  loadProjects: async () => {
    const db = await getDb();
    const projects = await db.select<Project[]>(
      "SELECT * FROM projects ORDER BY created_at ASC"
    );
    set({ projects });
    if (projects.length > 0 && !get().activeProjectId) {
      await get().loadCanvases(projects[0].id);
    }
  },

  loadCanvases: async (projectId: string) => {
    const db = await getDb();
    const canvases = await db.select<Canvas[]>(
      "SELECT * FROM canvases WHERE project_id = ? ORDER BY created_at ASC",
      [projectId]
    );
    set({ canvases, activeProjectId: projectId });
    if (canvases.length > 0) {
      await get().loadCanvas(canvases[0].id);
    } else {
      set({ nodes: [], edges: [], activeCanvasId: null });
    }
  },

  loadCanvas: async (canvasId: string) => {
    const db = await getDb();
    const nodes = await db.select<any[]>(
      "SELECT * FROM nodes WHERE canvas_id = ? ORDER BY z_index ASC",
      [canvasId]
    );
    const edges = await db.select<MindEdge[]>(
      "SELECT * FROM edges WHERE canvas_id = ?",
      [canvasId]
    );
    set({
      activeCanvasId: canvasId,
      nodes: nodes.map((n) => ({ ...n, data: JSON.parse(n.data), locked: !!n.locked, parent_id: n.parent_id ?? null })),
      edges,
    });
  },

  setActiveCanvas: (canvasId: string) => {
    get().loadCanvas(canvasId);
  },

  createProject: async (name, color, icon) => {
    const db = await getDb();
    const project: Project = {
      id: generateId(),
      name,
      color,
      icon,
      created_at: new Date().toISOString(),
    };
    await db.execute(
      "INSERT INTO projects (id, name, color, icon, created_at) VALUES (?, ?, ?, ?, ?)",
      [project.id, project.name, project.color, project.icon, project.created_at]
    );
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  updateProject: async (id, updates) => {
    const db = await getDb();
    const fields = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(", ");
    await db.execute(`UPDATE projects SET ${fields} WHERE id = ?`, [
      ...Object.values(updates),
      id,
    ]);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  },

  deleteProject: async (id) => {
    const db = await getDb();
    await db.execute("DELETE FROM projects WHERE id = ?", [id]);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    }));
    removeProjectIndex(id).catch(() => {});
  },

  createCanvas: async (projectId, name) => {
    const db = await getDb();
    const canvas: Canvas = {
      id: generateId(),
      project_id: projectId,
      name,
      viewport_x: 0,
      viewport_y: 0,
      zoom: 1,
      created_at: new Date().toISOString(),
    };
    await db.execute(
      "INSERT INTO canvases (id, project_id, name, viewport_x, viewport_y, zoom, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [canvas.id, canvas.project_id, canvas.name, canvas.viewport_x, canvas.viewport_y, canvas.zoom, canvas.created_at]
    );
    set((s) => ({ canvases: [...s.canvases, canvas] }));
    return canvas;
  },

  updateCanvas: async (id, updates) => {
    const db = await getDb();
    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
    await db.execute(`UPDATE canvases SET ${fields} WHERE id = ?`, [
      ...Object.values(updates), id,
    ]);
    set((s) => ({
      canvases: s.canvases.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  },

  deleteCanvas: async (id) => {
    const db = await getDb();
    await db.execute("DELETE FROM canvases WHERE id = ?", [id]);
    set((s) => ({
      canvases: s.canvases.filter((c) => c.id !== id),
      activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId,
    }));
    removeCanvasIndex(id).catch(() => {});
  },

  addNode: async (nodeData) => {
    const db = await getDb();
    const node: MindNode = {
      ...nodeData,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.execute(NODE_INSERT_SQL, nodeInsertParams(node));
    set((s) => ({ nodes: [...s.nodes, node] }));
    get().recordHistory({ t: "add", node });
    upsertNodeIndex(node).catch(() => {});
    return node;
  },

  updateNode: async (id, updates) => {
    const updated = { ...updates, updated_at: new Date().toISOString() };
    const current = get().nodes.find((n) => n.id === id);
    if (current) {
      const prev: Partial<MindNode> = {};
      for (const k of Object.keys(updated) as (keyof MindNode)[]) {
        (prev as any)[k] = current[k];
      }
      get().recordHistory({ t: "upd", id, prev, next: updated, at: Date.now() });
    }
    // Update state synchronously (optimistic) — controlled inputs garble keystrokes
    // if their value round-trips through an awaited DB write before re-rendering.
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...updated } : n)),
    }));
    try {
      const db = await getDb();
      if (updated.data) {
        await db.execute(
          "UPDATE nodes SET data = ?, updated_at = ?, x = COALESCE(?, x), y = COALESCE(?, y), width = COALESCE(?, width), height = COALESCE(?, height) WHERE id = ?",
          [JSON.stringify(updated.data), updated.updated_at, updates.x ?? null, updates.y ?? null, updates.width ?? null, updates.height ?? null, id]
        );
      } else {
        const fields = Object.keys(updated).map((k) => `${k} = ?`).join(", ");
        await db.execute(`UPDATE nodes SET ${fields} WHERE id = ?`, [
          ...Object.values(updated), id,
        ]);
      }
    } catch (err) {
      console.error("Failed to persist node update", id, err);
    }
    if (updated.data && current) {
      upsertNodeIndex({ id, canvas_id: current.canvas_id, type: current.type, data: updated.data }).catch(() => {});
    }
  },

  deleteNode: async (id) => {
    const node = get().nodes.find((n) => n.id === id);
    const connectedEdges = get().edges.filter((e) => e.source === id || e.target === id);
    const db = await getDb();
    // Ungroup children + delete node + delete edges atomically — a crash
    // mid-sequence must not leave orphaned edges or half-deleted groups.
    await db.execute("BEGIN");
    try {
      await db.execute("UPDATE nodes SET parent_id = NULL WHERE parent_id = ?", [id]);
      await db.execute("DELETE FROM nodes WHERE id = ?", [id]);
      await db.execute("DELETE FROM edges WHERE source = ? OR target = ?", [id, id]);
      await db.execute("COMMIT");
    } catch (err) {
      await db.execute("ROLLBACK").catch(() => {});
      throw err;
    }
    set((s) => ({
      nodes: s.nodes
        .filter((n) => n.id !== id)
        .map((n) => n.parent_id === id ? { ...n, parent_id: null } : n),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    }));
    if (node) {
      get().recordHistory({ t: "del", node, edges: connectedEdges });
    }
    removeNodeIndex(id).catch(() => {});
  },

  restoreNode: async (node) => {
    const db = await getDb();
    await db.execute(NODE_INSERT_SQL, nodeInsertParams(node));
    if (node.canvas_id === get().activeCanvasId) {
      set((s) => ({ nodes: [...s.nodes, node] }));
    }
    upsertNodeIndex(node).catch(() => {});
  },

  addEdge: async (edgeData) => {
    const db = await getDb();
    const edge: MindEdge = { ...edgeData, id: generateId() };
    await db.execute(
      "INSERT INTO edges (id, canvas_id, source, target) VALUES (?, ?, ?, ?)",
      [edge.id, edge.canvas_id, edge.source, edge.target]
    );
    set((s) => ({ edges: [...s.edges, edge] }));
    get().recordHistory({ t: "addEdge", edge });
    return edge;
  },

  deleteEdge: async (id) => {
    const edge = get().edges.find((e) => e.id === id);
    const db = await getDb();
    await db.execute("DELETE FROM edges WHERE id = ?", [id]);
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }));
    if (edge) {
      get().recordHistory({ t: "delEdge", edge });
    }
  },

  restoreEdge: async (edge) => {
    const db = await getDb();
    await db.execute(
      "INSERT INTO edges (id, canvas_id, source, target) VALUES (?, ?, ?, ?)",
      [edge.id, edge.canvas_id, edge.source, edge.target]
    );
    if (edge.canvas_id === get().activeCanvasId) {
      set((s) => ({ edges: [...s.edges, edge] }));
    }
  },
});
