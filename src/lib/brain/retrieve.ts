import { getDb } from "../db";
import { searchNodes } from "../search";
import { embedQuery, vectorTopK } from "./embeddings";

// Hybrid retrieval: FTS keyword hits ∪ vector hits, deduped per node.
// Keyword-only when LM Studio (embeddings) is unavailable.

export interface BrainPassage {
  nodeId: string;
  canvasId: string;
  projectId: string;
  type: string;
  title: string;
  text: string;
  score: number;
  canvasName: string;
  projectName: string;
}

export async function retrievePassages(query: string, k = 8): Promise<BrainPassage[]> {
  const q = query.trim();
  if (!q) return [];
  const byNode = new Map<string, BrainPassage>();

  // Vector side (chunk-level passages)
  try {
    const qv = await embedQuery(q);
    const hits = await vectorTopK(qv, k * 2);
    if (hits.length > 0) {
      const db = await getDb();
      const ids = hits.map((h) => h.chunkId);
      const placeholders = ids.map(() => "?").join(",");
      const rows = await db.select<any[]>(
        `SELECT ch.id AS chunk_id, ch.text, ch.node_id, ch.canvas_id, ch.project_id,
                n.type, c.name AS canvas_name, p.name AS project_name,
                COALESCE(s.title, '') AS title
         FROM chunks ch
         JOIN nodes n ON n.id = ch.node_id
         LEFT JOIN canvases c ON c.id = ch.canvas_id
         LEFT JOIN projects p ON p.id = ch.project_id
         LEFT JOIN search_index s ON s.node_id = ch.node_id
         WHERE ch.id IN (${placeholders})`,
        ids
      ).catch(async () =>
        // FTS table may be the plain fallback variant
        (await getDb()).select<any[]>(
          `SELECT ch.id AS chunk_id, ch.text, ch.node_id, ch.canvas_id, ch.project_id,
                  n.type, c.name AS canvas_name, p.name AS project_name, '' AS title
           FROM chunks ch
           JOIN nodes n ON n.id = ch.node_id
           LEFT JOIN canvases c ON c.id = ch.canvas_id
           LEFT JOIN projects p ON p.id = ch.project_id
           WHERE ch.id IN (${placeholders})`,
          ids
        )
      );
      const byChunk = new Map(rows.map((r) => [r.chunk_id, r]));
      for (const h of hits) {
        const r = byChunk.get(h.chunkId);
        if (!r) continue;
        const existing = byNode.get(r.node_id);
        if (!existing || h.score > existing.score) {
          byNode.set(r.node_id, {
            nodeId: r.node_id,
            canvasId: r.canvas_id,
            projectId: r.project_id,
            type: r.type,
            title: r.title || "(untitled)",
            text: r.text,
            score: h.score,
            canvasName: r.canvas_name || "",
            projectName: r.project_name || "",
          });
        }
      }
    }
  } catch {
    // embeddings offline — keyword-only retrieval below
  }

  // Keyword side
  try {
    const kw = await searchNodes(q, k);
    kw.forEach((r, i) => {
      const score = 0.5 - i * 0.02; // rough rank-based score, below strong vector hits
      const existing = byNode.get(r.nodeId);
      if (!existing) {
        byNode.set(r.nodeId, {
          nodeId: r.nodeId,
          canvasId: r.canvasId,
          projectId: r.projectId,
          type: r.type,
          title: r.title,
          text: r.snippet.replace(/[⟪⟫]/g, ""),
          score,
          canvasName: r.canvasName,
          projectName: r.projectName,
        });
      }
    });
  } catch { /* search not ready */ }

  return [...byNode.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
