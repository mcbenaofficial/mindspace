import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:mindspace.db");
    await runMigrations(_db);
    // Snapshot the vault on each launch; never block startup on it.
    backupDatabase(_db).catch((err) => console.warn("Auto-backup failed:", err));
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
}

export function generateId(): string {
  return crypto.randomUUID();
}
