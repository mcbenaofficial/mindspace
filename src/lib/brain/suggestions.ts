import { getDb } from "../db";
import { embedTexts, embedQuery, encodeVec, decodeVec } from "./embeddings";
import { MentalModel, getModelById } from "../mentalModels";

// Ambient mental-model suggestions: the model library is embedded once into
// the `embedding` column reserved in the Phase 1 migration (same base64
// Float32 codec as the Brain's node vectors), cached in memory, and matched
// against debounced node text with in-process cosine. Everything degrades
// silently when LM Studio is offline — no embeddings, no suggestions.

// Tuning: raise if chips appear on irrelevant content (false positives);
// lower if they rarely appear on clearly relevant content. One-line change;
// no re-embedding needed. Calibrated against nomic-embed-text-v1.5 on the
// real library: relevant matches score 0.71–0.76, unrelated operational
// text tops out around 0.51 — 0.68 splits the two with a wide margin (the
// spec's 0.72 starting point missed a 0.711 exact-match case).
export const SUGGESTION_THRESHOLD = 0.68;

const MIN_TEXT_LENGTH = 20;

interface ModelVec { vec: Float32Array; norm: number; }
let cache: Map<string, ModelVec> | null = null;

function norm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s) || 1;
}

/** One-time startup job: embeds every model whose embedding is NULL.
 *  Retries naturally on the next launch if LM Studio is unreachable. */
export async function embedAllModels(): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db.select<{ id: string; name: string; description: string | null; system_prompt_template: string | null }[]>(
      `SELECT id, name, description, system_prompt_template FROM mental_models WHERE embedding IS NULL`
    );
    if (rows.length === 0) {
      console.log("[suggestions] embedded 0 models");
      return;
    }
    const BATCH = 16;
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const vecs = await embedTexts(
        batch.map((r) => `${r.name}. ${r.description ?? ""}. ${r.system_prompt_template ?? ""}`)
      );
      for (let j = 0; j < batch.length; j++) {
        await db.execute(
          `UPDATE mental_models SET embedding = ? WHERE id = ?`,
          [encodeVec(vecs[j]), batch[j].id]
        );
        done++;
      }
    }
    console.log(`[suggestions] embedded ${done} models`);
  } catch (err) {
    console.warn("[suggestions] embedding job skipped:", (err as Error).message);
  }
}

/** Loads all model embeddings into the module cache. Call after embedAllModels. */
export async function loadModelEmbeddings(): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db.select<{ id: string; embedding: string }[]>(
      `SELECT id, embedding FROM mental_models WHERE embedding IS NOT NULL`
    );
    const m = new Map<string, ModelVec>();
    for (const r of rows) {
      try {
        const vec = decodeVec(r.embedding);
        m.set(r.id, { vec, norm: norm(vec) });
      } catch { /* skip corrupt row */ }
    }
    cache = m;
  } catch (err) {
    console.warn("[suggestions] embedding cache not loaded:", (err as Error).message);
  }
}

/** Top 0–2 models above threshold for the given node text. Returns []
 *  silently when embeddings aren't ready, the text is too short, or the
 *  embed call fails (LM Studio offline). */
export async function suggestModels(text: string, excludeIds?: Set<string>): Promise<MentalModel[]> {
  if (!cache || cache.size === 0) return [];
  const clean = text.trim();
  if (clean.length < MIN_TEXT_LENGTH) return [];
  let qv: Float32Array;
  try {
    qv = await embedQuery(clean);
  } catch {
    return [];
  }
  const qn = norm(qv);
  const scored: { id: string; score: number }[] = [];
  for (const [id, mv] of cache) {
    if (excludeIds?.has(id)) continue;
    // Embedding-model switch leaves stale dims — skip rather than mis-score.
    if (mv.vec.length !== qv.length) continue;
    let dot = 0;
    for (let i = 0; i < qv.length; i++) dot += qv[i] * mv.vec[i];
    const score = dot / (qn * mv.norm);
    if (score >= SUGGESTION_THRESHOLD) scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 2);
  const models = await Promise.all(top.map((s) => getModelById(s.id)));
  return models.filter((m): m is MentalModel => m !== null);
}

// ── Per-node session dismissals ───────────────────────────────────────────
// Module-level (not component state): React Flow may unmount off-screen
// nodes, and a dismissal must outlive that.

const dismissed = new Map<string, Set<string>>();

export function dismissModelForNode(nodeId: string, modelId: string): void {
  const set = dismissed.get(nodeId) ?? new Set<string>();
  set.add(modelId);
  dismissed.set(nodeId, set);
}

export function dismissedModelsForNode(nodeId: string): Set<string> | undefined {
  return dismissed.get(nodeId);
}
