import { getDb } from "./db";

// Typed access to the mental_models library (seeded in db.ts). Phase 1 uses
// it for the AI Chat lens; Phase 2 (model node) and Phase 3 (Brain
// suggestions, `embedding` column) build on the same table.

export type MentalModelCategory = "management" | "career" | "thinking";

export const CATEGORY_LABELS: Record<MentalModelCategory, string> = {
  management: "Management & Leadership",
  career: "Career",
  thinking: "Thinking & Perspective",
};

export interface MentalModel {
  id: string;
  name: string;
  category: MentalModelCategory;
  description: string;
  prompts: string[];
  system_prompt_template: string;
  tags: string[];
  source_url: string | null;
}

interface MentalModelRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  prompts: string | null;
  system_prompt_template: string | null;
  tags: string | null;
  source_url: string | null;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function rowToModel(r: MentalModelRow): MentalModel {
  return {
    id: r.id,
    name: r.name,
    category: r.category as MentalModelCategory,
    description: r.description ?? "",
    prompts: parseJsonArray(r.prompts),
    system_prompt_template: r.system_prompt_template ?? "",
    tags: parseJsonArray(r.tags),
    source_url: r.source_url,
  };
}

const COLS = "id, name, category, description, prompts, system_prompt_template, tags, source_url";

export async function getAllModels(): Promise<MentalModel[]> {
  const db = await getDb();
  const rows = await db.select<MentalModelRow[]>(
    `SELECT ${COLS} FROM mental_models ORDER BY category, name`
  );
  return rows.map(rowToModel);
}

export async function getModelById(id: string): Promise<MentalModel | null> {
  const db = await getDb();
  const rows = await db.select<MentalModelRow[]>(
    `SELECT ${COLS} FROM mental_models WHERE id = $1`,
    [id]
  );
  return rows.length > 0 ? rowToModel(rows[0]) : null;
}

export async function getModelsByCategory(category: MentalModelCategory): Promise<MentalModel[]> {
  const db = await getDb();
  const rows = await db.select<MentalModelRow[]>(
    `SELECT ${COLS} FROM mental_models WHERE category = $1 ORDER BY name`,
    [category]
  );
  return rows.map(rowToModel);
}
