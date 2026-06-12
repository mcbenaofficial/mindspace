import { getDb } from "./db";

// Full-text search over all node content. Prefers SQLite FTS5; falls back to a
// plain table + LIKE queries if the bundled SQLite lacks the FTS5 module.

let ftsAvailable: boolean | null = null;
let initPromise: Promise<void> | null = null;

const SKIP_KEYS = new Set(["thumbnail", "audio_url", "token", "api_key", "fullData"]);

function tiptapText(jsonStr: string): string {
  try {
    const doc = JSON.parse(jsonStr);
    const out: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (n: any) => {
      if (!n || typeof n !== "object") return;
      if (typeof n.text === "string") out.push(n.text);
      if (Array.isArray(n.content)) n.content.forEach(walk);
    };
    walk(doc);
    return out.join(" ");
  } catch {
    return jsonStr;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectStrings(v: any, out: string[], depth = 0) {
  if (depth > 6 || out.length > 500) return;
  if (typeof v === "string") {
    if (v.length > 0 && v.length <= 20000 && !v.startsWith("data:")) out.push(v);
  } else if (Array.isArray(v)) {
    v.forEach((x) => collectStrings(x, out, depth + 1));
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      if (SKIP_KEYS.has(k)) continue;
      collectStrings(val, out, depth + 1);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSearchText(type: string, data: any): { title: string; body: string } {
  const d = { ...(data ?? {}) };
  const title: string =
    (typeof d.title === "string" && d.title) ||
    (typeof d.label === "string" && d.label) ||
    (typeof d.fileName === "string" && d.fileName) ||
    (typeof d.feed_title === "string" && d.feed_title) ||
    (typeof d.url === "string" && d.url) ||
    "";
  // Note-style content is TipTap JSON — index its text, not the raw JSON.
  if ((type === "note" || type === "daily-journal") && typeof d.content === "string") {
    d.content = tiptapText(d.content);
  }
  if (type === "mental-model" && typeof d.summary === "string") {
    d.summary = tiptapText(d.summary);
  }
  const out: string[] = [];
  collectStrings(d, out);
  return { title, body: out.join(" ").slice(0, 30000) };
}

function table(): string {
  return ftsAvailable ? "search_index" : "search_index_plain";
}

export async function initSearchIndex(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = await getDb();
    try {
      await db.execute(
        `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(node_id UNINDEXED, canvas_id UNINDEXED, project_id UNINDEXED, type UNINDEXED, title, body)`
      );
      ftsAvailable = true;
    } catch {
      ftsAvailable = false;
      await db.execute(
        `CREATE TABLE IF NOT EXISTS search_index_plain (node_id TEXT PRIMARY KEY, canvas_id TEXT, project_id TEXT, type TEXT, title TEXT, body TEXT)`
      );
    }
    await syncSearchIndex();
  })();
  return initPromise;
}

// Rebuild only when the index has drifted from the vault. Skipping the
// no-op case keeps boot fast and avoids rebuilding inside the busy startup
// window every launch. Retries with growing delays so a rebuild that
// collides with boot-time DB traffic converges once things settle.
async function syncSearchIndex(): Promise<void> {
  const db = await getDb();
  for (const delayMs of [0, 2000, 8000]) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const [n] = await db.select<{ c: number }[]>(`SELECT COUNT(*) AS c FROM nodes`);
      const [i] = await db.select<{ c: number }[]>(`SELECT COUNT(*) AS c FROM ${table()}`);
      if ((n?.c ?? 0) === (i?.c ?? 0)) return;
      await rebuildSearchIndex();
    } catch (err) {
      console.warn("Search index sync attempt failed:", err);
    }
  }
}

// No explicit transaction here: tauri-plugin-sql runs statements on a
// connection pool, so raw BEGIN/COMMIT can land on different connections
// and abort mid-rebuild (which left the index empty). Per-row inserts with
// per-row error tolerance converge instead, and syncSearchIndex retries the
// rebuild on the next launch if anything was missed.
export async function rebuildSearchIndex(): Promise<void> {
  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await db.select<any[]>(
    `SELECT n.id, n.canvas_id, n.type, n.data, c.project_id FROM nodes n JOIN canvases c ON c.id = n.canvas_id`
  );
  await db.execute(`DELETE FROM ${table()}`);
  let failed = 0;
  for (const r of rows) {
    let parsed = {};
    let title = "", body = "";
    try {
      parsed = JSON.parse(r.data);
      ({ title, body } = extractSearchText(r.type, parsed));
    } catch { /* index the row with empty text rather than aborting */ }
    try {
      await db.execute(
        `INSERT INTO ${table()} (node_id, canvas_id, project_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)`,
        [r.id, r.canvas_id, r.project_id, r.type, title, body]
      );
    } catch (err) {
      if (!failed) console.warn("Search index insert failed:", err);
      failed++;
    }
  }
  if (failed) console.warn(`Search index rebuild: ${failed}/${rows.length} rows failed; will retry on next sync`);
}

export async function upsertNodeIndex(node: {
  id: string;
  canvas_id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}): Promise<void> {
  await initSearchIndex();
  const db = await getDb();
  const c = await db.select<{ project_id: string }[]>(
    `SELECT project_id FROM canvases WHERE id = ?`,
    [node.canvas_id]
  );
  const projectId = c[0]?.project_id ?? "";
  const { title, body } = extractSearchText(node.type, node.data);
  await db.execute(`DELETE FROM ${table()} WHERE node_id = ?`, [node.id]);
  await db.execute(
    `INSERT INTO ${table()} (node_id, canvas_id, project_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)`,
    [node.id, node.canvas_id, projectId, node.type, title, body]
  );
}

export async function removeNodeIndex(nodeId: string): Promise<void> {
  await initSearchIndex();
  const db = await getDb();
  await db.execute(`DELETE FROM ${table()} WHERE node_id = ?`, [nodeId]);
}

export async function removeCanvasIndex(canvasId: string): Promise<void> {
  await initSearchIndex();
  const db = await getDb();
  await db.execute(`DELETE FROM ${table()} WHERE canvas_id = ?`, [canvasId]);
}

export async function removeProjectIndex(projectId: string): Promise<void> {
  await initSearchIndex();
  const db = await getDb();
  await db.execute(`DELETE FROM ${table()} WHERE project_id = ?`, [projectId]);
}

export interface SearchResult {
  nodeId: string;
  canvasId: string;
  projectId: string;
  type: string;
  title: string;
  snippet: string;
  canvasName: string;
  projectName: string;
}

export async function searchNodes(query: string, limit = 30): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  await initSearchIndex();
  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[];
  if (ftsAvailable) {
    // Prefix-match every word: `foo ba` → `"foo"* "ba"*`
    const match = q
      .split(/\s+/)
      .map((tok) => `"${tok.replace(/"/g, '""')}"*`)
      .join(" ");
    rows = await db.select(
      `SELECT s.node_id, s.canvas_id, s.project_id, s.type, s.title,
              snippet(search_index, 5, '⟪', '⟫', '…', 14) AS snip,
              c.name AS canvas_name, p.name AS project_name
       FROM search_index s
       LEFT JOIN canvases c ON c.id = s.canvas_id
       LEFT JOIN projects p ON p.id = s.project_id
       WHERE search_index MATCH ?
       ORDER BY rank LIMIT ?`,
      [match, limit]
    );
  } else {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    rows = await db.select(
      `SELECT s.node_id, s.canvas_id, s.project_id, s.type, s.title,
              substr(s.body, 1, 90) AS snip,
              c.name AS canvas_name, p.name AS project_name
       FROM search_index_plain s
       LEFT JOIN canvases c ON c.id = s.canvas_id
       LEFT JOIN projects p ON p.id = s.project_id
       WHERE s.title LIKE ? OR s.body LIKE ?
       LIMIT ?`,
      [like, like, limit]
    );
  }
  return rows.map((r) => ({
    nodeId: r.node_id,
    canvasId: r.canvas_id,
    projectId: r.project_id,
    type: r.type,
    title: r.title || "(untitled)",
    snippet: r.snip || "",
    canvasName: r.canvas_name || "",
    projectName: r.project_name || "",
  }));
}
