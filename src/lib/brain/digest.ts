import { getDb } from "../db";
import { useStore } from "../../store";
import { httpPostJson, meanVector, vectorsForNodes, vectorTopK } from "./embeddings";
import { recentTriage, TriageLogItem } from "./triage";

// Daily "Today" digest: triage recap, resurfaced old-but-relevant nodes, and
// stale tasks. Generated once per day on first launch; LM Studio writes the
// summary prose when available.

export interface DigestItem {
  nodeId: string;
  title: string;
  canvasId: string;
  projectId: string;
  detail: string;
}

export interface DigestData {
  date: string; // YYYY-MM-DD
  summary: string;
  filed: TriageLogItem[];
  resurfaced: DigestItem[];
  staleTasks: DigestItem[];
}

async function nodeMeta(nodeIds: string[]): Promise<Map<string, DigestItem>> {
  if (nodeIds.length === 0) return new Map();
  const db = await getDb();
  const placeholders = nodeIds.map(() => "?").join(",");
  const rows = await db.select<any[]>(
    `SELECT n.id, n.canvas_id, n.updated_at, c.project_id,
            COALESCE(s.title, '') AS title
     FROM nodes n
     JOIN canvases c ON c.id = n.canvas_id
     LEFT JOIN search_index s ON s.node_id = n.id
     WHERE n.id IN (${placeholders})`,
    nodeIds
  ).catch(() => [] as any[]);
  return new Map(rows.map((r) => [r.id, {
    nodeId: r.id, title: r.title || "(untitled)", canvasId: r.canvas_id,
    projectId: r.project_id, detail: `last touched ${String(r.updated_at).slice(0, 10)}`,
  }]));
}

async function resurfaceCandidates(): Promise<DigestItem[]> {
  const db = await getDb();
  const now = Date.now();
  const recent = await db.select<{ id: string }[]>(
    `SELECT id FROM nodes WHERE updated_at >= ?`,
    [new Date(now - 7 * 86400_000).toISOString()]
  );
  const oldIds = new Set(
    (await db.select<{ id: string }[]>(
      `SELECT id FROM nodes WHERE updated_at < ?`,
      [new Date(now - 21 * 86400_000).toISOString()]
    )).map((r) => r.id)
  );
  if (oldIds.size === 0) return [];

  let picked: string[] = [];
  try {
    const recentVecs = await vectorsForNodes(recent.map((r) => r.id));
    const mean = meanVector(recentVecs.slice(0, 200));
    if (mean) {
      const hits = await vectorTopK(mean, 60);
      picked = [...new Set(hits.filter((h) => oldIds.has(h.nodeId)).map((h) => h.nodeId))].slice(0, 5);
    }
  } catch { /* offline */ }
  if (picked.length === 0) picked = [...oldIds].slice(0, 3);

  const meta = await nodeMeta(picked);
  return picked.map((id) => meta.get(id)).filter(Boolean) as DigestItem[];
}

async function staleTasks(): Promise<DigestItem[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT n.id, n.data FROM nodes n WHERE n.type = 'task' AND n.updated_at < ? LIMIT 30`,
    [new Date(Date.now() - 7 * 86400_000).toISOString()]
  );
  const openIds = rows.filter((r) => {
    try {
      const d = JSON.parse(r.data);
      return d.status !== "done" && (d.items ?? []).some((i: any) => !i.checked) || d.status === "todo";
    } catch { return false; }
  }).map((r) => r.id).slice(0, 5);
  const meta = await nodeMeta(openIds);
  return openIds.map((id) => meta.get(id)).filter(Boolean) as DigestItem[];
}

async function summarize(filed: TriageLogItem[], resurfaced: DigestItem[], stale: DigestItem[]): Promise<string> {
  const s = useStore.getState().settings;
  if (filed.length + resurfaced.length + stale.length === 0) return "";
  try {
    const json = await httpPostJson((s.lmstudio_url || "http://127.0.0.1:1234") + "/v1/chat/completions", {
      model: s.lmstudio_model || "local-model",
      temperature: 0.4,
      max_tokens: 180,
      messages: [{
        role: "user",
        content:
          `Write a friendly 2-3 sentence morning digest for a personal knowledge app. Facts:\n` +
          `- ${filed.filter((f) => f.status === "filed").length} captured items were auto-filed yesterday.\n` +
          `- Worth revisiting: ${resurfaced.map((r) => r.title).join("; ") || "nothing"}.\n` +
          `- Stale tasks: ${stale.map((t) => t.title).join("; ") || "none"}.\n` +
          `No markdown headers, no lists — just prose.`,
      }],
    });
    return (json.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
}

/** Generate (or load) today's digest. Never throws; returns null when disabled. */
export async function ensureDailyDigest(): Promise<DigestData | null> {
  const store = useStore.getState();
  if (!store.settings.digest_enabled) return null;
  const today = new Date().toISOString().slice(0, 10);
  const db = await getDb();

  const existing = await db.select<{ content: string }[]>(`SELECT content FROM digests WHERE date = ?`, [today]);
  if (existing[0]) {
    try { return JSON.parse(existing[0].content) as DigestData; } catch { /* regenerate */ }
  }

  const filed = await recentTriage(24).catch(() => [] as TriageLogItem[]);
  const resurfaced = await resurfaceCandidates().catch(() => [] as DigestItem[]);
  const stale = await staleTasks().catch(() => [] as DigestItem[]);
  const summary = await summarize(filed, resurfaced, stale);

  const digest: DigestData = { date: today, summary, filed, resurfaced, staleTasks: stale };
  await db.execute(
    `INSERT OR REPLACE INTO digests (date, content, created_at) VALUES (?, ?, ?)`,
    [today, JSON.stringify(digest), new Date().toISOString()]
  );
  return digest;
}

export function digestAsText(d: DigestData): string {
  const lines: string[] = [];
  if (d.summary) lines.push(d.summary, "");
  const filedCount = d.filed.filter((f) => f.status === "filed").length;
  if (filedCount) lines.push(`Auto-filed ${filedCount} captured item${filedCount === 1 ? "" : "s"}.`);
  if (d.resurfaced.length) lines.push("Worth revisiting: " + d.resurfaced.map((r) => r.title).join("; "));
  if (d.staleTasks.length) lines.push("Stale tasks: " + d.staleTasks.map((t) => t.title).join("; "));
  return lines.join("\n");
}
