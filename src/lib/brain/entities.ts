import { getDb, generateId } from "../db";
import { useStore } from "../../store";
import { httpPostJson } from "./embeddings";

// Entity extraction for the knowledge graph. Local model when available,
// heuristic fallback (hashtags + Capitalized Phrases) when offline.

const entityQueue = new Set<string>();
let draining = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ExtractedEntity { name: string; kind: string; }

export function scheduleEntityExtraction(nodeId: string): void {
  entityQueue.add(nodeId);
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (entityQueue.size > 0) {
      const id: string = entityQueue.values().next().value as string;
      entityQueue.delete(id);
      try {
        await extractForNode(id);
      } catch (err) {
        console.warn("Entity extraction skipped:", (err as Error).message);
      }
      await sleep(400);
    }
  } finally {
    draining = false;
  }
}

function heuristicEntities(text: string): ExtractedEntity[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/#([\w-]{2,30})/g)) {
    const name = m[1].toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 2);
  }
  for (const m of text.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3})\b/g)) {
    const name = m[1].toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => ({ name, kind: "topic" }));
}

async function llmEntities(text: string): Promise<ExtractedEntity[]> {
  const s = useStore.getState().settings;
  const url = (s.lmstudio_url || "http://127.0.0.1:1234") + "/v1/chat/completions";
  const json = await httpPostJson(url, {
    model: s.lmstudio_model || "local-model",
    temperature: 0,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content:
          `Extract up to 8 named entities (people, places, projects, organizations, key topics) from the text below. ` +
          `Respond with ONLY a JSON array like [{"name":"...","kind":"person|place|project|org|topic"}]. No prose.\n\nTEXT:\n${text}`,
      },
    ],
  });
  const raw: string = json.choices?.[0]?.message?.content ?? "[]";
  const match = raw.match(/\[[\s\S]*\]/);
  const arr = JSON.parse(match ? match[0] : "[]");
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((e: any) => typeof e?.name === "string" && e.name.trim().length >= 2)
    .slice(0, 8)
    .map((e: any) => ({
      name: e.name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60),
      kind: typeof e.kind === "string" ? e.kind.toLowerCase().slice(0, 16) : "topic",
    }));
}

async function extractForNode(nodeId: string): Promise<void> {
  const db = await getDb();
  const chunks = await db.select<{ text: string }[]>(
    `SELECT text FROM chunks WHERE node_id = ? ORDER BY seq ASC LIMIT 3`,
    [nodeId]
  );
  const text = chunks.map((c) => c.text).join(" ").slice(0, 2400);
  if (text.length < 40) return;

  let entities: ExtractedEntity[];
  try {
    entities = await llmEntities(text);
  } catch {
    entities = heuristicEntities(text);
  }

  await db.execute(`DELETE FROM mentions WHERE node_id = ?`, [nodeId]);
  for (const e of entities) {
    await db.execute(`INSERT OR IGNORE INTO entities (id, name, kind) VALUES (?, ?, ?)`, [generateId(), e.name, e.kind]);
    const row = await db.select<{ id: string }[]>(`SELECT id FROM entities WHERE name = ?`, [e.name]);
    if (row[0]) {
      await db.execute(
        `INSERT OR REPLACE INTO mentions (entity_id, node_id, count) VALUES (?, ?, 1)`,
        [row[0].id, nodeId]
      );
    }
  }
}

/** Nodes sharing entities with the given node, most-overlapping first. */
export async function entityRelatedNodes(nodeId: string, k = 5): Promise<{ nodeId: string; shared: number }[]> {
  const db = await getDb();
  const rows = await db.select<{ node_id: string; cnt: number }[]>(
    `SELECT m2.node_id AS node_id, COUNT(*) AS cnt
     FROM mentions m1 JOIN mentions m2 ON m1.entity_id = m2.entity_id AND m2.node_id != m1.node_id
     WHERE m1.node_id = ? GROUP BY m2.node_id ORDER BY cnt DESC LIMIT ?`,
    [nodeId, k]
  );
  return rows.map((r) => ({ nodeId: r.node_id, shared: r.cnt }));
}
