import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import mentalModelsSeed from "../data/mentalModels.seed.json";

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:mindspace.db");
    // WAL lets boot-time reads (incl. the backup VACUUM) coexist with index
    // writes — without it, bulk writes during startup die with SQLITE_BUSY.
    // PRAGMAs return rows, so they must go through select(), not execute().
    await _db.select("PRAGMA journal_mode=WAL").catch((err) => console.warn("WAL pragma failed:", err));
    await _db.select("PRAGMA busy_timeout=3000").catch(() => {});
    await runMigrations(_db);
    // Snapshot the vault on each launch (main window only — the capture
    // window booting at the same moment would race the same backup path);
    // never block startup on it.
    if (!window.location.search.includes("capture=1")) {
      backupDatabase(_db).catch((err) => console.warn("Auto-backup failed:", err));
    }
  }
  return _db;
}

async function backupDatabase(db: Database) {
  const path = await invoke<string>("prepare_backup_path");
  await db.execute(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
}

async function runMigrations(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#5b8dee',
      icon TEXT NOT NULL DEFAULT 'folder',
      created_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      viewport_x REAL NOT NULL DEFAULT 0,
      viewport_y REAL NOT NULL DEFAULT 0,
      zoom REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      canvas_id TEXT NOT NULL,
      type TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      z_index INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      canvas_id TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrations for added columns
  try {
    await db.execute(`ALTER TABLE nodes ADD COLUMN locked INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }
  try {
    await db.execute(`ALTER TABLE nodes ADD COLUMN parent_id TEXT`);
  } catch {
    // Column already exists
  }

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_nodes_canvas ON nodes(canvas_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_canvases_project ON canvases(project_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_edges_canvas ON edges(canvas_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target)`);

  // ── Brain (Phase 2): semantic memory, knowledge graph, triage, digests ──
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      canvas_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      text TEXT NOT NULL,
      hash TEXT NOT NULL
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_chunks_node ON chunks(node_id)`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS vectors (
      chunk_id TEXT PRIMARY KEY,
      dim INTEGER NOT NULL,
      vec TEXT NOT NULL
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'topic'
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mentions (
      entity_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (entity_id, node_id)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_mentions_node ON mentions(node_id)`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      a_node TEXT NOT NULL,
      b_node TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'related',
      created_at TEXT NOT NULL
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_links_a ON links(a_node)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_links_b ON links(b_node)`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS triage_log (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      from_canvas TEXT,
      to_canvas TEXT,
      title TEXT,
      confidence REAL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS digests (
      date TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger_json TEXT NOT NULL,
      action_json TEXT NOT NULL,
      state_json TEXT NOT NULL DEFAULT '{}',
      last_run TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // ── Mental Models (Phase 1: chat lens; embedding reserved for Phase 3) ──
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mental_models (
      id                     TEXT PRIMARY KEY,
      name                   TEXT NOT NULL,
      category               TEXT NOT NULL,
      description            TEXT,
      prompts                TEXT,
      system_prompt_template TEXT,
      tags                   TEXT,
      embedding              BLOB,
      source_url             TEXT
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_mm_category ON mental_models(category)`);
  await seedMentalModels(db);
}

async function seedMentalModels(db: Database) {
  const rows = await db.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM mental_models`);
  if ((rows[0]?.n ?? 0) > 0) return;
  // No explicit transaction — the plugin's pooled connections make raw
  // BEGIN/COMMIT unsafe here (see search-index fix, v1.6.2).
  for (const m of mentalModelsSeed) {
    await db.execute(
      `INSERT OR IGNORE INTO mental_models
         (id, name, category, description, prompts, system_prompt_template, tags, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [m.id, m.name, m.category, m.description, JSON.stringify(m.prompts), m.system_prompt_template, JSON.stringify(m.tags), m.source_url]
    );
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}
