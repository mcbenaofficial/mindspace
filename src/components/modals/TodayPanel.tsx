import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sunrise, Inbox, RotateCcw, CheckSquare, X, FileText, Wand2, Check } from "lucide-react";
import { useStore } from "../../store";
import { jumpToNode } from "../../lib/brain/navigation";
import { triageInbox } from "../../lib/brain/triage";
import { digestAsText, DigestItem } from "../../lib/brain/digest";
import { sounds } from "../../lib/sound";
import { DailyJournalData, JournalEntry, NodeData } from "../../types";

function ItemRow({ item, onJump }: { item: DigestItem; onJump: () => void }) {
  return (
    <button
      onClick={onJump}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
        background: "none", border: "none", borderRadius: 7, padding: "6px 8px",
        cursor: "pointer", color: "var(--ms-text)", fontSize: 12.5,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--ms-accent-15)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
      <span style={{ fontSize: 10, color: "var(--ms-text-muted)", flexShrink: 0 }}>{item.detail}</span>
    </button>
  );
}

export function TodayPanel() {
  const { digest, setTodayOpen, inboxCount, triageRecent, nodes, updateNode, settings } = useStore();
  const [triaging, setTriaging] = useState(false);
  const [inserted, setInserted] = useState(false);

  useEffect(() => {
    useStore.getState().loadTriageRecent().catch(() => {});
  }, []);

  const jump = (item: DigestItem) => {
    setTodayOpen(false);
    jumpToNode(item.nodeId, item.canvasId, item.projectId);
  };

  const runTriage = async () => {
    setTriaging(true);
    try {
      const filed = await triageInbox();
      if (filed > 0) sounds.complete();
    } finally {
      setTriaging(false);
    }
  };

  const insertIntoJournal = async () => {
    if (!digest) return;
    const journal = nodes.find((n) => n.type === "daily-journal");
    if (!journal) return;
    const jd = journal.data as DailyJournalData;
    const entry: JournalEntry = { date: digest.date, content: digestAsText(digest) };
    const entries = [...(jd.entries ?? []).filter((e) => e.date !== digest.date), entry];
    await updateNode(journal.id, { data: { ...jd, entries } as NodeData });
    setInserted(true);
    sounds.save();
  };

  const filedRecently = triageRecent.filter((t) => t.status === "filed").slice(0, 6);
  const hasJournal = nodes.some((n) => n.type === "daily-journal");

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "absolute", top: 12, right: 12, bottom: 12, width: 320, zIndex: 80,
        background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
        borderRadius: 14, boxShadow: "0 16px 60px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", borderBottom: "1px solid var(--ms-border)" }}>
        <Sunrise size={15} color="var(--ms-accent)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ms-text)", flex: 1 }}>Today</span>
        <button onClick={() => setTodayOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", display: "flex" }}>
          <X size={14} />
        </button>
      </div>

      <div className="nowheel" style={{ flex: 1, overflowY: "auto", padding: "10px 10px 16px" }}>
        {digest?.summary && (
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ms-text)", padding: "4px 8px 10px", margin: 0 }}>
            {digest.summary}
          </p>
        )}

        {/* Inbox */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 8px 4px" }}>
          <Inbox size={12} color="var(--ms-text-muted)" />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ms-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", flex: 1 }}>
            Inbox · {inboxCount}
          </span>
          {inboxCount > 0 && settings.triage_enabled && (
            <button onClick={runTriage} disabled={triaging}
              style={{
                display: "flex", alignItems: "center", gap: 4, background: "var(--ms-accent-15)",
                border: "1px solid var(--ms-accent-25)", borderRadius: 6, padding: "2px 8px",
                fontSize: 10.5, color: "var(--ms-accent)", cursor: triaging ? "wait" : "pointer",
              }}>
              <Wand2 size={10} /> {triaging ? "Filing…" : "File now"}
            </button>
          )}
        </div>
        {filedRecently.length > 0 && (
          <div style={{ padding: "0 8px 6px" }}>
            {filedRecently.map((t) => (
              <div key={t.id} style={{ fontSize: 11, color: "var(--ms-text-muted)", padding: "3px 0", display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={10} color="var(--ms-accent)" style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  filed “{t.title || "untitled"}”
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Resurfaced */}
        {digest && digest.resurfaced.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 8px 4px" }}>
              <RotateCcw size={12} color="var(--ms-text-muted)" />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ms-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Worth revisiting
              </span>
            </div>
            {digest.resurfaced.map((r) => <ItemRow key={r.nodeId} item={r} onJump={() => jump(r)} />)}
          </>
        )}

        {/* Stale tasks */}
        {digest && digest.staleTasks.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 8px 4px" }}>
              <CheckSquare size={12} color="var(--ms-text-muted)" />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ms-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Stale tasks
              </span>
            </div>
            {digest.staleTasks.map((t) => <ItemRow key={t.nodeId} item={t} onJump={() => jump(t)} />)}
          </>
        )}

        {!digest && (
          <p style={{ fontSize: 12, color: "var(--ms-text-muted)", padding: "8px", lineHeight: 1.5 }}>
            No digest yet today — it generates on the first launch of the day.
          </p>
        )}
      </div>

      {digest && hasJournal && (
        <div style={{ borderTop: "1px solid var(--ms-border)", padding: "10px 12px" }}>
          <button onClick={insertIntoJournal} disabled={inserted}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: inserted ? "var(--ms-border)" : "var(--ms-accent-15)",
              border: "1px solid var(--ms-accent-25)", borderRadius: 8, padding: "7px 0",
              fontSize: 12, color: inserted ? "var(--ms-text-muted)" : "var(--ms-accent)",
              cursor: inserted ? "default" : "pointer", fontWeight: 600,
            }}>
            <FileText size={12} /> {inserted ? "Added to journal" : "Insert into Daily Journal"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
