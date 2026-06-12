import { getDb, generateId } from "../db";
import { extractSearchText } from "../search";
import { useStore } from "../../store";
import { httpPostJson } from "./embeddings";

// Auto-file triage: classifies Inbox nodes against the user's canvases via the
// local model and moves confident matches (each move is one undoable step).
// Low-confidence items stay in the Inbox; everything pauses when offline.

export interface TriageLogItem {
  id: string;
  node_id: string;
  from_canvas: string | null;
  to_canvas: string | null;
  title: string | null;
  confidence: number | null;
  status: string; // 'filed' | 'kept'
  created_at: string;
}

let running = false;

interface CanvasCandidate { id: string; name: string; projectName: string; sampleTitles: string[]; }

async function loadCandidates(inboxCanvasId: string, inboxProjectId: string): Promise<CanvasCandidate[]> {
  const db = await getDb();
  const canvases = await db.select<{ id: string; name: string; project_name: string }[]>(
    `SELECT c.id, c.name, p.name AS project_name FROM canvases c JOIN projects p ON p.id = c.project_id
     WHERE c.id != ? AND p.id != ?`,
    [inboxCanvasId, inboxProjectId]
  );
  const out: CanvasCandidate[] = [];
  for (const c of canvases) {
    let titles: string[] = [];
    try {
      const rows = await db.select<{ title: string }[]>(
        `SELECT title FROM search_index WHERE canvas_id = ? AND title != '' LIMIT 6`, [c.id]
      );
      titles = rows.map((r) => r.title);
    } catch { /* fallback table or empty */ }
    out.push({ id: c.id, name: c.name, projectName: c.project_name, sampleTitles: titles });
  }
  return out;
}

interface TriageDecision { canvas_id: string; title?: string; confidence: number; }

async function classify(text: string, candidates: CanvasCandidate[]): Promise<TriageDecision | null> {
  const s = useStore.getState().settings;
  const url = (s.lmstudio_url || "http://127.0.0.1:1234") + "/v1/chat/completions";
  const list = candidates
    .map((c) => `- id: ${c.id} | ${c.projectName} / ${c.name}${c.sampleTitles.length ? ` | contains: ${c.sampleTitles.join(", ").slice(0, 200)}` : ""}`)
    .join("\n");
  const json = await httpPostJson(url, {
    model: s.lmstudio_model || "local-model",
    temperature: 0,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content:
          `You file captured notes into the best-matching workspace canvas.\n\nCANVASES:\n${list}\n\n` +
          `ITEM:\n${text.slice(0, 1200)}\n\n` +
          `Respond with ONLY JSON: {"canvas_id":"<id from the list>","title":"<short improved title>","confidence":<0..1>}. ` +
          `Use confidence below 0.5 if no canvas is clearly right.`,
      },
    ],
  });
  const raw: string = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const d = JSON.parse(match[0]);
    if (typeof d?.canvas_id !== "string" || typeof d?.confidence !== "number") return null;
    return { canvas_id: d.canvas_id, title: typeof d.title === "string" ? d.title.slice(0, 80) : undefined, confidence: d.confidence };
  } catch {
    return null;
  }
}

async function logRow(item: Omit<TriageLogItem, "id" | "created_at">): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO triage_log (id, node_id, from_canvas, to_canvas, title, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateId(), item.node_id, item.from_canvas, item.to_canvas, item.title, item.confidence, item.status, new Date().toISOString()]
  );
}

/** Triage all (or specific) Inbox nodes. Returns how many were filed. */
export async function triageInbox(nodeIds?: string[]): Promise<number> {
  const store = useStore.getState();
  if (!store.settings.triage_enabled || running) return 0;
  running = true;
  let filed = 0;
  try {
    const inbox = await store.ensureInbox();
    const db = await getDb();
    let rows = await db.select<any[]>(`SELECT * FROM nodes WHERE canvas_id = ?`, [inbox.canvasId]);
    if (nodeIds) rows = rows.filter((r) => nodeIds.includes(r.id));
    if (rows.length === 0) return 0;

    const candidates = await loadCandidates(inbox.canvasId, inbox.projectId);
    if (candidates.length === 0) return 0;
    const threshold = store.settings.triage_threshold || 0.7;

    for (const row of rows) {
      let data: any = {};
      try { data = JSON.parse(row.data); } catch { /* empty */ }
      const { title, body } = extractSearchText(row.type, data);
      const text = [title, body].filter(Boolean).join("\n").trim();
      if (!text) continue;

      let decision: TriageDecision | null = null;
      try {
        decision = await classify(text, candidates);
      } catch (err) {
        console.warn("Triage paused (model offline):", (err as Error).message);
        break;
      }

      const target = decision && candidates.find((c) => c.id === decision!.canvas_id);
      if (decision && target && decision.confidence >= threshold) {
        await useStore.getState().runBatch(async () => {
          await useStore.getState().moveNodeToCanvas(row.id, target.id);
          if (
            decision!.title &&
            (row.type === "note" || row.type === "task") &&
            typeof data.title === "string"
          ) {
            await useStore.getState().updateNode(row.id, { data: { ...data, title: decision!.title } });
          }
        });
        await logRow({
          node_id: row.id, from_canvas: inbox.canvasId, to_canvas: target.id,
          title: decision.title ?? title ?? null, confidence: decision.confidence, status: "filed",
        });
        filed++;
      } else {
        await logRow({
          node_id: row.id, from_canvas: inbox.canvasId, to_canvas: null,
          title: title || null, confidence: decision?.confidence ?? null, status: "kept",
        });
      }
    }
  } finally {
    running = false;
    const s = useStore.getState();
    s.refreshInboxCount().catch(() => {});
    s.loadTriageRecent().catch(() => {});
  }
  return filed;
}

export async function recentTriage(hours = 24): Promise<TriageLogItem[]> {
  const db = await getDb();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return db.select<TriageLogItem[]>(
    `SELECT * FROM triage_log WHERE created_at >= ? ORDER BY created_at DESC LIMIT 50`,
    [since]
  );
}
