import { useCallback, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { ListChecks, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, HabitTrackerData, HabitItem } from "../../types";
import { generateId } from "../../lib/db";
import { format, startOfWeek, addDays, isSameDay, addWeeks } from "date-fns";

export type HabitTrackerNodeType = Node<{ mindNode: MindNode }, "habit-tracker">;

const ACCENT = "#8b5cf6";

const PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

function getStreakForHabit(habitId: string, completions: Record<string, string[]>): number {
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = format(d, "yyyy-MM-dd");
    if (completions[key]?.includes(habitId)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function HabitTrackerNode({ data, selected }: NodeProps<HabitTrackerNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as HabitTrackerData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitColor, setNewHabitColor] = useState(PRESET_COLORS[0]);
  const [hoveredHabit, setHoveredHabit] = useState<string | null>(null);

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const toggleCompletion = useCallback(
    (habitId: string, day: Date) => {
      const key = format(day, "yyyy-MM-dd");
      const existing = d.completions[key] ?? [];
      const newList = existing.includes(habitId)
        ? existing.filter((id) => id !== habitId)
        : [...existing, habitId];
      updateNode(mindNode.id, {
        data: {
          ...d,
          completions: { ...d.completions, [key]: newList },
        },
      });
    },
    [d, mindNode.id, updateNode]
  );

  const addHabit = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      if (!newHabitName.trim()) return;
      const habit: HabitItem = {
        id: generateId(),
        name: newHabitName.trim(),
        color: newHabitColor,
      };
      updateNode(mindNode.id, {
        data: { ...d, habits: [...d.habits, habit] },
      });
      setNewHabitName("");
      setNewHabitColor(PRESET_COLORS[0]);
      setShowAddForm(false);
    },
    [d, mindNode.id, updateNode, newHabitName, newHabitColor]
  );

  const deleteHabit = useCallback(
    (habitId: string) => {
      const habits = d.habits.filter((h) => h.id !== habitId);
      // Also clean up completions
      const completions: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(d.completions)) {
        completions[k] = v.filter((id) => id !== habitId);
      }
      updateNode(mindNode.id, { data: { ...d, habits, completions } });
    },
    [d, mindNode.id, updateNode]
  );

  const isCompleted = (habitId: string, day: Date) => {
    const key = format(day, "yyyy-MM-dd");
    return (d.completions[key] ?? []).includes(habitId);
  };

  const isTodayColumn = (day: Date) => isSameDay(day, today);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={320}
        minHeight={200}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: ACCENT, flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <ListChecks size={14} color={ACCENT} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Habits</span>
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); setShowAddForm(v => !v); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: showAddForm ? ACCENT : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <Plus size={12} />
        </button>
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <div className="ms-node-body nodrag nopan" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Week nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 2px", flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setWeekOffset(v => v - 1); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", padding: "2px 4px", display: "flex", alignItems: "center" }}
          >
            <ChevronLeft size={13} />
          </button>
          <span style={{ fontSize: 11, color: "var(--ms-text-muted)", fontWeight: 500 }}>
            {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setWeekOffset(v => v + 1); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", padding: "2px 4px", display: "flex", alignItems: "center" }}
          >
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Grid */}
        <div style={{ overflow: "auto", flex: 1, padding: "0 8px 8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 10, color: "var(--ms-text-muted)", fontWeight: 500, padding: "3px 4px 3px 0", minWidth: 80 }}>
                  Habit
                </th>
                {weekDays.map((day) => (
                  <th
                    key={day.toISOString()}
                    style={{
                      fontSize: 10,
                      color: isTodayColumn(day) ? ACCENT : "var(--ms-text-muted)",
                      fontWeight: isTodayColumn(day) ? 700 : 500,
                      padding: "3px 2px",
                      textAlign: "center",
                      width: 28,
                    }}
                  >
                    <div>{format(day, "EEE").slice(0, 1)}</div>
                    <div style={{ fontSize: 9 }}>{format(day, "d")}</div>
                  </th>
                ))}
                <th style={{ fontSize: 10, color: "var(--ms-text-muted)", fontWeight: 500, padding: "3px 2px", textAlign: "center", minWidth: 36 }}>
                  🔥
                </th>
              </tr>
            </thead>
            <tbody>
              {d.habits.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ fontSize: 11, color: "var(--ms-text-muted)", fontStyle: "italic", padding: "10px 0", textAlign: "center" }}>
                    No habits yet — click + to add
                  </td>
                </tr>
              ) : (
                d.habits.map((habit) => {
                  const streak = getStreakForHabit(habit.id, d.completions);
                  return (
                    <tr
                      key={habit.id}
                      onMouseEnter={() => setHoveredHabit(habit.id)}
                      onMouseLeave={() => setHoveredHabit(null)}
                      style={{ borderTop: "1px solid var(--ms-border)" }}
                    >
                      <td style={{ padding: "4px 4px 4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: habit.color, flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontSize: 11, color: "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 72 }}>
                            {habit.name}
                          </span>
                          {hoveredHabit === habit.id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteHabit(habit.id); }}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const checked = isCompleted(habit.id, day);
                        const isToday = isTodayColumn(day);
                        return (
                          <td key={day.toISOString()} style={{ textAlign: "center", padding: "2px" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleCompletion(habit.id, day); }}
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                border: `1.5px solid ${checked ? habit.color : isToday ? ACCENT : "var(--ms-border)"}`,
                                background: checked ? habit.color : "transparent",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "background 0.12s",
                              }}
                            >
                              {checked && <span style={{ fontSize: 10, color: "#fff", lineHeight: 1 }}>✓</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "center", padding: "2px 4px", fontSize: 11, color: streak > 0 ? "#f97316" : "var(--ms-text-muted)", fontWeight: 600 }}>
                        {streak > 0 ? streak : "–"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Add habit form */}
        {showAddForm && (
          <div
            style={{ padding: "8px", borderTop: "1px solid var(--ms-border)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              placeholder="Habit name..."
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addHabit(e as unknown as React.KeyboardEvent); }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", background: "var(--ms-surface)", border: "1px solid var(--ms-border)", borderRadius: 5, color: "var(--ms-text)", fontSize: 12, padding: "5px 8px", outline: "none", boxSizing: "border-box", userSelect: "text" }}
            />
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={(e) => { e.stopPropagation(); setNewHabitColor(c); }}
                  style={{ width: 16, height: 16, borderRadius: "50%", background: c, border: newHabitColor === c ? "2px solid var(--ms-text)" : "2px solid transparent", cursor: "pointer" }}
                />
              ))}
              <button
                onClick={(e) => addHabit(e)}
                style={{ marginLeft: "auto", background: ACCENT, border: "none", borderRadius: 5, color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 10px", cursor: "pointer" }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default HabitTrackerNode;
