import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getDb, generateId } from "../db";
import { upsertNodeIndex } from "../search";
import { enqueueNodeEmbedding } from "../brain/embeddings";
import { useStore } from "../../store";
import type { MindNode, NodeType, TaskData, RSSReaderData, ZenVariation } from "../../types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RuleTrigger =
  | { kind: "node-created"; nodeType?: NodeType | ""; canvasId?: string }
  | { kind: "task-due"; mode: "due-today" | "overdue" }
  | { kind: "rss-match"; keywords: string }
  | { kind: "schedule"; time: string } // "HH:MM", local time, fires once per day
  | { kind: "zen-session-completed"; variation?: ZenVariation | ""; canvasId?: string };

export type RuleAction =
  | { kind: "notify"; title?: string; body?: string }
  | { kind: "create-note"; canvasId: string; titleTemplate?: string; contentTemplate?: string }
  | { kind: "move-to-canvas"; canvasId: string }
  | { kind: "run-triage" };

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  action: RuleAction;
  state: { fired: string[] };
  last_run: string | null;
  created_at: string;
}

/** Template context: {title}, {match}, {date} placeholders in action templates. */
interface FireContext {
  nodeId?: string;
  title?: string;
  match?: string;
}

const FIRED_CAP = 500;

// ─── CRUD (shared with the Automations UI) ───────────────────────────────────

function rowToRule(r: any): Rule {
  let state = { fired: [] as string[] };
  try {
    const parsed = JSON.parse(r.state_json || "{}");
    if (Array.isArray(parsed.fired)) state.fired = parsed.fired;
  } catch { /* corrupted state resets */ }
  return {
    id: r.id,
    name: r.name,
    enabled: !!r.enabled,
    trigger: JSON.parse(r.trigger_json),
    action: JSON.parse(r.action_json),
    state,
    last_run: r.last_run ?? null,
    created_at: r.created_at,
  };
}

export async function loadRules(): Promise<Rule[]> {
  const db = await getDb();
  const rows = await db.select<any[]>("SELECT * FROM rules ORDER BY created_at ASC");
  const rules: Rule[] = [];
  for (const r of rows) {
    try { rules.push(rowToRule(r)); } catch { /* skip malformed row */ }
  }
  return rules;
}

export async function createRule(name: string, trigger: RuleTrigger, action: RuleAction): Promise<Rule> {
  const db = await getDb();
  const rule: Rule = {
    id: generateId(), name, enabled: true, trigger, action,
    state: { fired: [] }, last_run: null, created_at: new Date().toISOString(),
  };
  await db.execute(
    "INSERT INTO rules (id, name, enabled, trigger_json, action_json, state_json, created_at) VALUES (?, ?, 1, ?, ?, '{}', ?)",
    [rule.id, rule.name, JSON.stringify(trigger), JSON.stringify(action), rule.created_at],
  );
  return rule;
}

export async function updateRule(rule: Rule): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE rules SET name = ?, enabled = ?, trigger_json = ?, action_json = ? WHERE id = ?",
    [rule.name, rule.enabled ? 1 : 0, JSON.stringify(rule.trigger), JSON.stringify(rule.action), rule.id],
  );
}

export async function deleteRule(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM rules WHERE id = ?", [id]);
}

async function persistRuleRun(rule: Rule): Promise<void> {
  const db = await getDb();
  if (rule.state.fired.length > FIRED_CAP) {
    rule.state.fired = rule.state.fired.slice(-FIRED_CAP);
  }
  await db.execute(
    "UPDATE rules SET state_json = ?, last_run = ? WHERE id = ?",
    [JSON.stringify(rule.state), new Date().toISOString(), rule.id],
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function fillTemplate(tpl: string, ctx: FireContext): string {
  return tpl
    .split("{title}").join(ctx.title ?? "")
    .split("{match}").join(ctx.match ?? "")
    .split("{date}").join(new Date().toLocaleDateString());
}

async function notifyNative(title: string, body: string): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body });
}

async function runAction(rule: Rule, ctx: FireContext): Promise<void> {
  const a = rule.action;
  switch (a.kind) {
    case "notify": {
      await notifyNative(
        fillTemplate(a.title || rule.name, ctx),
        fillTemplate(a.body || ctx.title || "", ctx),
      );
      return;
    }
    case "create-note": {
      // Dynamic import: the registry pulls in every node component, which the
      // rules engine must not drag into the store's module graph.
      const { getDefaultSize, getDefaultData } = await import("../../components/nodes/registry");
      const store = useStore.getState();
      const title = fillTemplate(a.titleTemplate || "{title}", ctx) || "Note";
      const content = fillTemplate(a.contentTemplate || "", ctx);
      const data = { ...getDefaultData("note"), title, content };
      if (a.canvasId && a.canvasId === store.activeCanvasId) {
        // Active canvas: go through the store so the node appears immediately
        // (and is undoable) without a reload.
        const size = getDefaultSize("note");
        await store.addNode({
          canvas_id: a.canvasId, type: "note",
          x: 120 + Math.random() * 400, y: 120 + Math.random() * 300,
          width: size.width, height: size.height,
          z_index: store.nodes.reduce((acc, n) => Math.max(acc, n.z_index), 0) + 1,
          locked: false, parent_id: null, data: data as any,
        });
        return;
      }
      // Other canvases: direct SQL — store.addNode would inject the node into
      // the active canvas's state.
      const db = await getDb();
      const size = getDefaultSize("note");
      const now = new Date().toISOString();
      const node: MindNode = {
        id: generateId(), canvas_id: a.canvasId, type: "note",
        x: 120 + Math.random() * 400, y: 120 + Math.random() * 300,
        width: size.width, height: size.height,
        z_index: 0, locked: false, parent_id: null,
        data: data as any, created_at: now, updated_at: now,
      };
      await db.execute(
        "INSERT INTO nodes (id, canvas_id, type, x, y, width, height, z_index, locked, parent_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [node.id, node.canvas_id, node.type, node.x, node.y, node.width, node.height,
         node.z_index, 0, null, JSON.stringify(node.data), node.created_at, node.updated_at],
      );
      upsertNodeIndex(node).catch(() => {});
      enqueueNodeEmbedding(node.id);
      return;
    }
    case "move-to-canvas": {
      if (!ctx.nodeId || !a.canvasId) return;
      await useStore.getState().moveNodeToCanvas(ctx.nodeId, a.canvasId);
      return;
    }
    case "run-triage": {
      const { triageInbox } = await import("../brain/triage");
      await triageInbox();
      return;
    }
  }
}

async function fire(rule: Rule, key: string, ctx: FireContext): Promise<boolean> {
  if (rule.state.fired.includes(key)) return false;
  rule.state.fired.push(key);
  try {
    await runAction(rule, ctx);
  } catch (err) {
    console.warn(`Rule "${rule.name}" action failed:`, err);
  }
  await persistRuleRun(rule);
  return true;
}

// ─── Triggers ────────────────────────────────────────────────────────────────

/** Hook called from dataSlice.addNode for event-style triggers. */
export function notifyNodeCreated(node: MindNode): void {
  // Fire-and-forget; never block node creation on rule evaluation.
  (async () => {
    const rules = await loadRules();
    for (const rule of rules) {
      if (!rule.enabled || rule.trigger.kind !== "node-created") continue;
      const t = rule.trigger;
      if (t.nodeType && node.type !== t.nodeType) continue;
      if (t.canvasId && node.canvas_id !== t.canvasId) continue;
      const title = (node.data as any)?.title || (node.data as any)?.content?.slice?.(0, 60) || node.type;
      await fire(rule, `created:${node.id}`, { nodeId: node.id, title });
    }
  })().catch(() => {});
}

const ZEN_VARIATION_LABELS: Record<string, string> = {
  pendulum: "Pendulum Wave",
  orbits: "Polyrhythm Orbits",
  rain: "Rainfall",
  breath: "Breathing Orb",
  fireflies: "Fireflies",
  ocean: "Ocean Swell",
};

/** Event hook called by the Zen Node when a session timer reaches zero. */
export function notifyZenSessionCompleted(payload: {
  nodeId: string;
  canvasId: string;
  variation: ZenVariation;
  durationMinutes: number;
}): void {
  // Fire-and-forget; never block the node's UI on rule evaluation.
  (async () => {
    const rules = await loadRules();
    for (const rule of rules) {
      if (!rule.enabled || rule.trigger.kind !== "zen-session-completed") continue;
      const t = rule.trigger;
      if (t.variation && payload.variation !== t.variation) continue;
      if (t.canvasId && payload.canvasId !== t.canvasId) continue;
      const label = ZEN_VARIATION_LABELS[payload.variation] || "Zen";
      // Unique key per completion so each session fires once.
      await fire(rule, `zen:${payload.nodeId}:${Date.now()}`, {
        nodeId: payload.nodeId,
        title: `${label} session (${payload.durationMinutes} min)`,
      });
    }
  })().catch(() => {});
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function checkTaskDue(rule: Rule & { trigger: Extract<RuleTrigger, { kind: "task-due" }> }): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: string; data: string }[]>(
    "SELECT id, data FROM nodes WHERE type = 'task'",
  );
  const today = localDateKey(new Date());
  for (const row of rows) {
    let data: TaskData;
    try { data = JSON.parse(row.data); } catch { continue; }
    if (!data.due_date || data.status === "done") continue;
    const due = data.due_date.slice(0, 10);
    const hit = rule.trigger.mode === "overdue" ? due < today : due === today;
    if (!hit) continue;
    await fire(rule, `task:${row.id}:${due}:${rule.trigger.mode}`, {
      nodeId: row.id,
      title: data.title || "Task",
    });
  }
}

async function checkRssMatch(rule: Rule & { trigger: Extract<RuleTrigger, { kind: "rss-match" }> }): Promise<void> {
  const keywords = rule.trigger.keywords
    .split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (!keywords.length) return;
  const db = await getDb();
  const rows = await db.select<{ id: string; data: string }[]>(
    "SELECT id, data FROM nodes WHERE type = 'rss-reader'",
  );
  for (const row of rows) {
    let data: RSSReaderData;
    try { data = JSON.parse(row.data); } catch { continue; }
    for (const item of data.items ?? []) {
      const haystack = `${item.title} ${item.description}`.toLowerCase();
      const matched = keywords.find((k) => haystack.includes(k));
      if (!matched) continue;
      await fire(rule, `rss:${item.link || item.title}`, {
        nodeId: row.id,
        title: item.title,
        match: `${item.title}${item.link ? `\n${item.link}` : ""}`,
      });
    }
  }
}

async function checkSchedule(rule: Rule & { trigger: Extract<RuleTrigger, { kind: "schedule" }> }): Promise<void> {
  const now = new Date();
  const [h, m] = rule.trigger.time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return;
  // Fire on the first tick at or past the scheduled time today.
  if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) return;
  await fire(rule, `sched:${localDateKey(now)}:${rule.trigger.time}`, {
    title: rule.name,
  });
}

// ─── Tick loop ───────────────────────────────────────────────────────────────

let tickTimer: ReturnType<typeof setInterval> | null = null;

export async function tickRules(): Promise<void> {
  let rules: Rule[];
  try { rules = await loadRules(); } catch { return; }
  for (const rule of rules) {
    if (!rule.enabled) continue;
    try {
      if (rule.trigger.kind === "task-due") await checkTaskDue(rule as any);
      else if (rule.trigger.kind === "rss-match") await checkRssMatch(rule as any);
      else if (rule.trigger.kind === "schedule") await checkSchedule(rule as any);
    } catch (err) {
      console.warn(`Rule "${rule.name}" tick failed:`, err);
    }
  }
}

export function startRulesEngine(): void {
  if (tickTimer) return;
  setTimeout(() => { tickRules().catch(() => {}); }, 8000);
  tickTimer = setInterval(() => { tickRules().catch(() => {}); }, 60_000);
}

export function stopRulesEngine(): void {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
