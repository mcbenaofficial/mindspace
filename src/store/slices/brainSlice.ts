import { StateCreator } from "zustand";
import { getDb } from "../../lib/db";
import type { AppState } from "../index";
import type { TriageLogItem } from "../../lib/brain/triage";
import type { DigestData } from "../../lib/brain/digest";

export type BrainStatus = "idle" | "indexing" | "ready" | "offline";

export interface BrainSlice {
  brainStatus: BrainStatus;
  brainChunkCount: number;
  inboxCount: number;
  triageRecent: TriageLogItem[];
  digest: DigestData | null;

  setBrainStatus: (s: BrainStatus) => void;
  setBrainChunkCount: (n: number) => void;
  setDigest: (d: DigestData | null) => void;
  refreshInboxCount: () => Promise<void>;
  loadTriageRecent: () => Promise<void>;
  /** Finds or creates the system "Inbox" project + canvas. */
  ensureInbox: () => Promise<{ projectId: string; canvasId: string }>;
  /** Moves a node to another canvas; history-recorded even when the node
   * isn't on the active canvas (the common triage case). */
  moveNodeToCanvas: (nodeId: string, canvasId: string) => Promise<void>;
}

export const createBrainSlice: StateCreator<AppState, [], [], BrainSlice> = (set, get) => ({
  brainStatus: "idle",
  brainChunkCount: 0,
  inboxCount: 0,
  triageRecent: [],
  digest: null,

  setBrainStatus: (s) => set({ brainStatus: s }),
  setBrainChunkCount: (n) => set({ brainChunkCount: n }),
  setDigest: (d) => set({ digest: d }),

  refreshInboxCount: async () => {
    const canvasId = get().settings.inbox_canvas_id;
    if (!canvasId) { set({ inboxCount: 0 }); return; }
    const db = await getDb();
    const rows = await db.select<{ c: number }[]>(`SELECT COUNT(*) AS c FROM nodes WHERE canvas_id = ?`, [canvasId]);
    set({ inboxCount: rows[0]?.c ?? 0 });
  },

  loadTriageRecent: async () => {
    const { recentTriage } = await import("../../lib/brain/triage");
    const items = await recentTriage(48).catch(() => []);
    set({ triageRecent: items });
  },

  ensureInbox: async () => {
    const s = get();
    const db = await getDb();
    // Validate remembered ids
    if (s.settings.inbox_canvas_id) {
      const rows = await db.select<{ id: string; project_id: string }[]>(
        `SELECT id, project_id FROM canvases WHERE id = ?`, [s.settings.inbox_canvas_id]
      );
      if (rows[0]) return { projectId: rows[0].project_id, canvasId: rows[0].id };
    }
    // Find by name (tolerates the pre-v1.5.1 emoji-prefixed name)
    const existing = await db.select<{ id: string }[]>(
      `SELECT id FROM projects WHERE name IN ('Inbox', '📥 Inbox') LIMIT 1`
    );
    let projectId = existing[0]?.id;
    if (!projectId) {
      const project = await s.createProject("Inbox", "#8a8f98", "brain");
      projectId = project.id;
    }
    const canvases = await db.select<{ id: string }[]>(`SELECT id FROM canvases WHERE project_id = ? LIMIT 1`, [projectId]);
    let canvasId = canvases[0]?.id;
    if (!canvasId) {
      const canvas = await s.createCanvas(projectId, "Inbox");
      canvasId = canvas.id;
    }
    await s.saveSettings({ inbox_project_id: projectId, inbox_canvas_id: canvasId });
    return { projectId, canvasId };
  },

  moveNodeToCanvas: async (nodeId, canvasId) => {
    const db = await getDb();
    const rows = await db.select<{ canvas_id: string }[]>(`SELECT canvas_id FROM nodes WHERE id = ?`, [nodeId]);
    const from = rows[0]?.canvas_id;
    if (!from || from === canvasId) return;
    // updateNode skips history for nodes outside the active canvas — record here.
    if (!get().nodes.some((n) => n.id === nodeId)) {
      get().recordHistory({
        t: "upd", id: nodeId,
        prev: { canvas_id: from }, next: { canvas_id: canvasId },
        at: Date.now(),
      });
    }
    await get().updateNode(nodeId, { canvas_id: canvasId });
    get().refreshInboxCount().catch(() => {});
  },
});
