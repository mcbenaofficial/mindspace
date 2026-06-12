import { getDb, generateId } from "../db";
import { extractSearchText } from "../search";
import { isTauri } from "../tauri-compat";
import { useStore } from "../../store";
import { scheduleEntityExtraction } from "./entities";

// Local-first semantic memory: chunks node text, embeds via LM Studio
// /v1/embeddings, stores vectors as base64 Float32 in SQLite, and serves
// brute-force cosine top-K from an in-memory cache. No native extensions —
// sqlite-vec can't load through tauri-plugin-sql.

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH = 16;

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];
  const out: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start + CHUNK_SIZE / 2) end = lastSpace;
    }
    out.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return out;
}

export function encodeVec(v: Float32Array): string {
  const u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < u8.length; i += STEP) {
    bin += String.fromCharCode(...u8.subarray(i, i + STEP));
  }
  return btoa(bin);
}

export function decodeVec(b64: string): Float32Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer);
}

// ── LM Studio client ──────────────────────────────────────────────────────

let cachedModel: string | null = null;

async function lmBase(): Promise<string> {
  return useStore.getState().settings.lmstudio_url || "http://127.0.0.1:1234";
}

async function httpGetJson(url: string): Promise<any> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<{ status: number; body: string }>("http_get", { url });
    if (res.status < 200 || res.status >= 300) throw new Error(`GET ${res.status}`);
    return JSON.parse(res.body);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
}

export async function httpPostJson(url: string, body: object): Promise<any> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<{ status: number; body: string }>("http_post", {
      url, body: JSON.stringify(body), apiKey: null,
    });
    if (res.status < 200 || res.status >= 300) {
      let detail = res.body;
      try { detail = JSON.parse(res.body)?.error?.message || res.body; } catch { /* raw */ }
      throw new Error(`POST ${res.status}: ${detail}`);
    }
    return JSON.parse(res.body);
  }
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json();
}

export async function resolveEmbeddingModel(): Promise<string> {
  const setting = useStore.getState().settings.lmstudio_embedding_model;
  if (setting) return setting;
  if (cachedModel) return cachedModel;
  const json = await httpGetJson((await lmBase()) + "/v1/models");
  const ids: string[] = (json.data ?? []).map((m: any) => m.id);
  const found = ids.find((id) => id.toLowerCase().includes("embed"));
  if (!found) throw new Error("No embedding model loaded in LM Studio (load e.g. nomic-embed-text)");
  cachedModel = found;
  return found;
}

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const model = await resolveEmbeddingModel();
  const json = await httpPostJson((await lmBase()) + "/v1/embeddings", { model, input: texts });
  const data = [...(json.data ?? [])].sort((a: any, b: any) => a.index - b.index);
  if (data.length !== texts.length) throw new Error("Embedding count mismatch");
  return data.map((d: any) => Float32Array.from(d.embedding));
}

export async function embedQuery(q: string): Promise<Float32Array> {
  return (await embedTexts([q.slice(0, CHUNK_SIZE)]))[0];
}

// ── Vector cache ──────────────────────────────────────────────────────────

interface CachedVec { nodeId: string; vec: Float32Array; norm: number; }
const vecCache = new Map<string, CachedVec>(); // chunk_id → vec
let cacheLoaded = false;

function norm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s) || 1;
}

async function ensureCache(): Promise<void> {
  if (cacheLoaded) return;
  const db = await getDb();
  const rows = await db.select<{ chunk_id: string; vec: string; node_id: string }[]>(
    `SELECT v.chunk_id, v.vec, c.node_id FROM vectors v JOIN chunks c ON c.id = v.chunk_id`
  );
  for (const r of rows) {
    try {
      const vec = decodeVec(r.vec);
      vecCache.set(r.chunk_id, { nodeId: r.node_id, vec, norm: norm(vec) });
    } catch { /* skip corrupt row */ }
  }
  cacheLoaded = true;
  publishCounts();
}

function publishCounts() {
  try { useStore.getState().setBrainChunkCount(vecCache.size); } catch { /* store not ready */ }
}

export interface VectorHit { chunkId: string; nodeId: string; score: number; }

export async function vectorTopK(queryVec: Float32Array, k = 12): Promise<VectorHit[]> {
  await ensureCache();
  const qn = norm(queryVec);
  const hits: VectorHit[] = [];
  for (const [chunkId, c] of vecCache) {
    if (c.vec.length !== queryVec.length) continue;
    let dot = 0;
    for (let i = 0; i < queryVec.length; i++) dot += queryVec[i] * c.vec[i];
    const score = dot / (qn * c.norm);
    hits.push({ chunkId, nodeId: c.nodeId, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

/** Nodes most similar to the given node (max chunk-pair cosine), excluding itself. */
export async function nearestNodes(nodeId: string, k = 5): Promise<{ nodeId: string; score: number }[]> {
  await ensureCache();
  const own = [...vecCache.values()].filter((c) => c.nodeId === nodeId);
  if (own.length === 0) return [];
  const best = new Map<string, number>();
  for (const o of own) {
    for (const c of vecCache.values()) {
      if (c.nodeId === nodeId || c.vec.length !== o.vec.length) continue;
      let dot = 0;
      for (let i = 0; i < o.vec.length; i++) dot += o.vec[i] * c.vec[i];
      const score = dot / (o.norm * c.norm);
      if (score > (best.get(c.nodeId) ?? -1)) best.set(c.nodeId, score);
    }
  }
  return [...best.entries()]
    .map(([id, score]) => ({ nodeId: id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function meanVector(vecs: Float32Array[]): Float32Array | null {
  if (vecs.length === 0) return null;
  const out = new Float32Array(vecs[0].length);
  for (const v of vecs) for (let i = 0; i < out.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vecs.length;
  return out;
}

export async function vectorsForNodes(nodeIds: string[]): Promise<Float32Array[]> {
  await ensureCache();
  const set = new Set(nodeIds);
  return [...vecCache.values()].filter((c) => set.has(c.nodeId)).map((c) => c.vec);
}

// ── Index queue ───────────────────────────────────────────────────────────

const queue = new Set<string>();
let draining = false;

function setStatus(s: "idle" | "indexing" | "ready" | "offline") {
  try { useStore.getState().setBrainStatus(s); } catch { /* store not ready */ }
}

export function enqueueNodeEmbedding(nodeId: string): void {
  queue.add(nodeId);
  void drain();
}

export async function backfillBrainIndex(): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(`SELECT id FROM nodes`);
  rows.forEach((r) => queue.add(r.id));
  void drain();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  setStatus("indexing");
  try {
    while (queue.size > 0) {
      const id: string = queue.values().next().value as string;
      queue.delete(id);
      try {
        await indexNode(id);
      } catch (err) {
        // LM Studio unreachable / no embedding model: stop draining quietly.
        console.warn("Brain indexing paused:", (err as Error).message);
        setStatus("offline");
        draining = false;
        return;
      }
      await sleep(40);
    }
    setStatus("ready");
    publishCounts();
  } finally {
    draining = false;
  }
}

async function indexNode(nodeId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT n.id, n.canvas_id, n.type, n.data, c.project_id
     FROM nodes n JOIN canvases c ON c.id = n.canvas_id WHERE n.id = ?`,
    [nodeId]
  );
  if (rows.length === 0) {
    // Node deleted — purge its chunks/vectors and cache entries.
    await db.execute(`DELETE FROM vectors WHERE chunk_id IN (SELECT id FROM chunks WHERE node_id = ?)`, [nodeId]);
    await db.execute(`DELETE FROM chunks WHERE node_id = ?`, [nodeId]);
    for (const [cid, c] of vecCache) if (c.nodeId === nodeId) vecCache.delete(cid);
    publishCounts();
    return;
  }
  const row = rows[0];
  let data = {};
  try { data = JSON.parse(row.data); } catch { /* empty */ }
  const { title, body } = extractSearchText(row.type, data);
  const full = [title, body].filter(Boolean).join("\n");
  const texts = chunkText(full);
  const hashes = texts.map(hashStr);

  const existing = await db.select<{ id: string; seq: number; hash: string }[]>(
    `SELECT id, seq, hash FROM chunks WHERE node_id = ? ORDER BY seq ASC`,
    [nodeId]
  );
  const unchanged =
    existing.length === texts.length &&
    existing.every((e, i) => e.hash === hashes[i]);

  if (!unchanged) {
    await db.execute(`DELETE FROM vectors WHERE chunk_id IN (SELECT id FROM chunks WHERE node_id = ?)`, [nodeId]);
    await db.execute(`DELETE FROM chunks WHERE node_id = ?`, [nodeId]);
    for (const [cid, c] of vecCache) if (c.nodeId === nodeId) vecCache.delete(cid);
    for (let i = 0; i < texts.length; i++) {
      await db.execute(
        `INSERT INTO chunks (id, node_id, canvas_id, project_id, seq, text, hash) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), nodeId, row.canvas_id, row.project_id, i, texts[i], hashes[i]]
      );
    }
  }

  // Embed whichever chunks lack vectors (covers both fresh and previously-offline rows).
  const missing = await db.select<{ id: string; text: string }[]>(
    `SELECT c.id, c.text FROM chunks c LEFT JOIN vectors v ON v.chunk_id = c.id
     WHERE c.node_id = ? AND v.chunk_id IS NULL ORDER BY c.seq ASC`,
    [nodeId]
  );
  for (let i = 0; i < missing.length; i += EMBED_BATCH) {
    const batch = missing.slice(i, i + EMBED_BATCH);
    const vecs = await embedTexts(batch.map((b) => b.text));
    for (let j = 0; j < batch.length; j++) {
      const v = vecs[j];
      await db.execute(
        `INSERT OR REPLACE INTO vectors (chunk_id, dim, vec) VALUES (?, ?, ?)`,
        [batch[j].id, v.length, encodeVec(v)]
      );
      vecCache.set(batch[j].id, { nodeId, vec: v, norm: norm(v) });
    }
  }

  if (!unchanged && full.length > 40) {
    scheduleEntityExtraction(nodeId);
  }
}

export async function rebuildBrainIndex(): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM vectors`);
  await db.execute(`DELETE FROM chunks`);
  vecCache.clear();
  cacheLoaded = true; // cache is now authoritative (empty)
  cachedModel = null;
  await backfillBrainIndex();
}

export function brainQueueSize(): number {
  return queue.size;
}
