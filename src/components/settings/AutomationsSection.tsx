import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Zap } from "lucide-react";
import { getDb } from "../../lib/db";
import {
  Rule, RuleTrigger, RuleAction,
  loadRules, createRule, updateRule, deleteRule,
} from "../../lib/rules/engine";

interface CanvasOption { id: string; name: string; project: string }

const TRIGGER_KINDS: { kind: RuleTrigger["kind"]; label: string }[] = [
  { kind: "node-created", label: "Node is created" },
  { kind: "task-due", label: "Task is due" },
  { kind: "rss-match", label: "RSS item matches keywords" },
  { kind: "schedule", label: "Daily at a set time" },
  { kind: "zen-session-completed", label: "Zen session completed" },
];

const ACTION_KINDS: { kind: RuleAction["kind"]; label: string }[] = [
  { kind: "notify", label: "Send a notification" },
  { kind: "create-note", label: "Create a note" },
  { kind: "move-to-canvas", label: "Move the node to a canvas" },
  { kind: "run-triage", label: "Run Inbox triage" },
];

function triggerSummary(t: RuleTrigger): string {
  switch (t.kind) {
    case "node-created": return `When a ${t.nodeType || "node"} is created`;
    case "task-due": return t.mode === "overdue" ? "When a task is overdue" : "When a task is due today";
    case "rss-match": return `When RSS matches "${t.keywords}"`;
    case "schedule": return `Daily at ${t.time}`;
    case "zen-session-completed": return `When a ${t.variation || "Zen"} session completes`;
  }
}

function actionSummary(a: RuleAction): string {
  switch (a.kind) {
    case "notify": return "notify";
    case "create-note": return "create a note";
    case "move-to-canvas": return "move to canvas";
    case "run-triage": return "run triage";
  }
}

const selStyle: React.CSSProperties = {
  background: "var(--ms-bg)", border: "1px solid var(--ms-border)", borderRadius: 7,
  padding: "6px 8px", color: "var(--ms-text)", fontSize: 11.5, outline: "none",
  width: "100%", fontFamily: "inherit",
};

const inStyle: React.CSSProperties = { ...selStyle };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 10.5, color: "var(--ms-text-muted)", display: "block", marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

export function AutomationsSection() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [canvases, setCanvases] = useState<CanvasOption[]>([]);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);

  // Builder form state
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<RuleTrigger>({ kind: "node-created", nodeType: "", canvasId: "" });
  const [action, setAction] = useState<RuleAction>({ kind: "notify", title: "", body: "" });

  const refresh = useCallback(async () => {
    setRules(await loadRules().catch(() => []));
  }, []);

  useEffect(() => {
    refresh();
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select<{ id: string; name: string; project: string }[]>(
          "SELECT c.id, c.name, p.name AS project FROM canvases c JOIN projects p ON p.id = c.project_id ORDER BY p.name, c.name",
        );
        setCanvases(rows);
      } catch { /* settings still usable without canvas list */ }
    })();
  }, [refresh]);

  const openNew = () => {
    setName("");
    setTrigger({ kind: "node-created", nodeType: "", canvasId: "" });
    setAction({ kind: "notify", title: "", body: "" });
    setEditing("new");
  };

  const openEdit = (rule: Rule) => {
    setName(rule.name);
    setTrigger(rule.trigger);
    setAction(rule.action);
    setEditing(rule);
  };

  const save = async () => {
    const finalName = name.trim() || `${triggerSummary(trigger)} then ${actionSummary(action)}`;
    if (editing === "new") {
      await createRule(finalName, trigger, action);
    } else if (editing) {
      await updateRule({ ...editing, name: finalName, trigger, action });
    }
    setEditing(null);
    refresh();
  };

  const setTriggerKind = (kind: RuleTrigger["kind"]) => {
    if (kind === "node-created") setTrigger({ kind, nodeType: "", canvasId: "" });
    else if (kind === "task-due") setTrigger({ kind, mode: "due-today" });
    else if (kind === "rss-match") setTrigger({ kind, keywords: "" });
    else if (kind === "zen-session-completed") setTrigger({ kind, variation: "", canvasId: "" });
    else setTrigger({ kind: "schedule", time: "09:00" });
  };

  const setActionKind = (kind: RuleAction["kind"]) => {
    if (kind === "notify") setAction({ kind, title: "", body: "" });
    else if (kind === "create-note") setAction({ kind, canvasId: canvases[0]?.id ?? "", titleTemplate: "", contentTemplate: "" });
    else if (kind === "move-to-canvas") setAction({ kind, canvasId: canvases[0]?.id ?? "" });
    else setAction({ kind: "run-triage" });
  };

  const canvasSelect = (value: string, onChange: (id: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={selStyle}>
      {canvases.map((c) => (
        <option key={c.id} value={c.id}>{c.project} / {c.name}</option>
      ))}
    </select>
  );

  return (
    <div style={{ padding: "4px 2px 14px" }}>
      {/* Rule list */}
      {rules.length === 0 && !editing && (
        <div style={{ fontSize: 11.5, color: "var(--ms-text-muted)", marginBottom: 10 }}>
          No automations yet. Rules run while the app is open — when a trigger fires, its action runs once.
        </div>
      )}
      {rules.map((rule) => (
        <div key={rule.id} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
          background: "var(--ms-bg)", border: "1px solid var(--ms-border)",
          borderRadius: 8, marginBottom: 6,
        }}>
          <Zap size={13} style={{ color: rule.enabled ? "var(--ms-accent)" : "var(--ms-text-muted)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, color: "var(--ms-text)", overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{rule.name}</div>
            <div style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>
              {triggerSummary(rule.trigger)} → {actionSummary(rule.action)}
              {rule.last_run ? ` · last ran ${new Date(rule.last_run).toLocaleString()}` : " · never ran"}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={rule.enabled}
            onClick={async () => { await updateRule({ ...rule, enabled: !rule.enabled }); refresh(); }}
            style={{
              width: 30, height: 17, borderRadius: 9, border: "none", cursor: "pointer", padding: 0,
              background: rule.enabled ? "var(--ms-accent)" : "var(--ms-border)", position: "relative", flexShrink: 0,
            }}
          >
            <span style={{
              position: "absolute", top: 2.5, left: rule.enabled ? 15 : 2.5,
              width: 12, height: 12, borderRadius: "50%", background: "#fff",
              transition: "left 0.15s ease",
            }} />
          </button>
          <button onClick={() => openEdit(rule)} title="Edit"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", padding: 2, display: "flex" }}>
            <Pencil size={13} />
          </button>
          <button onClick={async () => { await deleteRule(rule.id); refresh(); }} title="Delete"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", padding: 2, display: "flex" }}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      {/* Builder */}
      {editing ? (
        <div style={{
          padding: 10, background: "var(--ms-bg)", border: "1px solid var(--ms-border)",
          borderRadius: 10, marginTop: 8,
        }}>
          <Field label="Name (optional — auto-generated from the rule)">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My automation" style={inStyle} />
          </Field>

          <Field label="When">
            <select value={trigger.kind} onChange={(e) => setTriggerKind(e.target.value as RuleTrigger["kind"])} style={selStyle}>
              {TRIGGER_KINDS.map((t) => <option key={t.kind} value={t.kind}>{t.label}</option>)}
            </select>
          </Field>
          {trigger.kind === "node-created" && (
            <Field label="Node type (blank = any)">
              <input value={trigger.nodeType ?? ""} onChange={(e) => setTrigger({ ...trigger, nodeType: e.target.value.trim() as any })}
                placeholder="e.g. task, note, rss-reader" style={inStyle} />
            </Field>
          )}
          {trigger.kind === "task-due" && (
            <Field label="Mode">
              <select value={trigger.mode} onChange={(e) => setTrigger({ ...trigger, mode: e.target.value as "due-today" | "overdue" })} style={selStyle}>
                <option value="due-today">Due today</option>
                <option value="overdue">Overdue</option>
              </select>
            </Field>
          )}
          {trigger.kind === "rss-match" && (
            <Field label="Keywords (comma-separated)">
              <input value={trigger.keywords} onChange={(e) => setTrigger({ ...trigger, keywords: e.target.value })}
                placeholder="ai, tauri, release" style={inStyle} />
            </Field>
          )}
          {trigger.kind === "schedule" && (
            <Field label="Time (24h)">
              <input type="time" value={trigger.time} onChange={(e) => setTrigger({ ...trigger, time: e.target.value })} style={inStyle} />
            </Field>
          )}
          {trigger.kind === "zen-session-completed" && (
            <Field label="Variation (blank = any)">
              <select value={trigger.variation ?? ""} onChange={(e) => setTrigger({ ...trigger, variation: e.target.value as any })} style={selStyle}>
                <option value="">Any variation</option>
                <option value="pendulum">Pendulum Wave</option>
                <option value="orbits">Polyrhythm Orbits</option>
                <option value="rain">Rainfall</option>
                <option value="breath">Breathing Orb</option>
                <option value="fireflies">Fireflies</option>
                <option value="ocean">Ocean Swell</option>
              </select>
            </Field>
          )}

          <Field label="Then">
            <select value={action.kind} onChange={(e) => setActionKind(e.target.value as RuleAction["kind"])} style={selStyle}>
              {ACTION_KINDS.map((a) => <option key={a.kind} value={a.kind}>{a.label}</option>)}
            </select>
          </Field>
          {action.kind === "notify" && (
            <>
              <Field label="Notification title ({title}, {match}, {date} available)">
                <input value={action.title ?? ""} onChange={(e) => setAction({ ...action, title: e.target.value })}
                  placeholder="Defaults to the rule name" style={inStyle} />
              </Field>
              <Field label="Notification body">
                <input value={action.body ?? ""} onChange={(e) => setAction({ ...action, body: e.target.value })}
                  placeholder="{title}" style={inStyle} />
              </Field>
            </>
          )}
          {action.kind === "create-note" && (
            <>
              <Field label="Target canvas">{canvasSelect(action.canvasId, (id) => setAction({ ...action, canvasId: id }))}</Field>
              <Field label="Note title template">
                <input value={action.titleTemplate ?? ""} onChange={(e) => setAction({ ...action, titleTemplate: e.target.value })}
                  placeholder="{title}" style={inStyle} />
              </Field>
              <Field label="Note content template">
                <input value={action.contentTemplate ?? ""} onChange={(e) => setAction({ ...action, contentTemplate: e.target.value })}
                  placeholder="{match}" style={inStyle} />
              </Field>
            </>
          )}
          {action.kind === "move-to-canvas" && (
            <Field label="Target canvas">{canvasSelect(action.canvasId, (id) => setAction({ ...action, canvasId: id }))}</Field>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button onClick={() => setEditing(null)}
              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid var(--ms-border)", background: "none", color: "var(--ms-text-muted)", fontSize: 11, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={save}
              style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "var(--ms-accent)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {editing === "new" ? "Create rule" : "Save changes"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={openNew}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
            borderRadius: 8, border: "1px dashed var(--ms-border)", background: "none",
            color: "var(--ms-text-muted)", fontSize: 11.5, cursor: "pointer", marginTop: 4,
          }}>
          <Plus size={13} /> New automation
        </button>
      )}
    </div>
  );
}
