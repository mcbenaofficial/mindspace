import React from "react";
import {
  FileText, CheckSquare, CalendarDays, Clock, Bot, Mic, Mic2, Volume2, Link2,
  Sparkles, BookOpen, PlayCircle, SeparatorHorizontal, TrendingUp,
  Cloud, Calculator, Group, StickyNote, AlarmClock, Hourglass,
  Globe2, ArrowLeftRight, Code2, Hash, Timer, ListChecks, Columns2,
  BookMarked, GitBranch, Bookmark, Rss, BarChart2, Layers, Brain,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NodeType } from "../../types";
import { withNodeBoundary } from "./NodeErrorBoundary";

import { NoteNode } from "./NoteNode";
import { TaskNode } from "./TaskNode";
import { CalendarNode } from "./CalendarNode";
import { ClockNode } from "./ClockNode";
import { AiChatNode } from "./AiChatNode";
import { VoiceNode } from "./VoiceNode";
import { STTNode } from "./STTNode";
import { TTSNode } from "./TTSNode";
import { ProjectHubNode } from "./ProjectHubNode";
import { WebLinkNode } from "./WebLinkNode";
import { CosmicNode } from "./CosmicNode";
import { FileNode } from "./FileNode";
import { VideoNode } from "./VideoNode";
import { DividerNode } from "./DividerNode";
import { FinanceNode } from "./FinanceNode";
import { WeatherNode } from "./WeatherNode";
import { CalculatorNode } from "./CalculatorNode";
import { GroupNode } from "./GroupNode";
import { StickyNoteNode } from "./StickyNoteNode";
import { CountdownNode } from "./CountdownNode";
import { HourglassNode } from "./HourglassNode";
import { WorldClockNode } from "./WorldClockNode";
import { CurrencyNode } from "./CurrencyNode";
import { CodeSnippetNode } from "./CodeSnippetNode";
import { MarkdownNode } from "./MarkdownNode";
import { PomodoroNode } from "./PomodoroNode";
import { HabitTrackerNode } from "./HabitTrackerNode";
import { KanbanNode } from "./KanbanNode";
import { DailyJournalNode } from "./DailyJournalNode";
import { GitHubIssuesNode } from "./GitHubIssuesNode";
import { BookmarkClusterNode } from "./BookmarkClusterNode";
import { RSSReaderNode } from "./RSSReaderNode";
import { ChartNode } from "./ChartNode";
import { MentalModelNode } from "./MentalModelNode";

export type NodeCategory = "create" | "plan" | "think" | "time" | "data" | "connect";

export const CATEGORIES: { id: NodeCategory; label: string }[] = [
  { id: "create",  label: "Create" },
  { id: "plan",    label: "Plan" },
  { id: "think",   label: "Think" },
  { id: "time",    label: "Time" },
  { id: "data",    label: "Data" },
  { id: "connect", label: "More" },
];

export interface NodeDef {
  /** Memoized + error-boundary-wrapped component, ready for React Flow. */
  component: React.ComponentType<any>;
  label: string;
  /** Lucide component type — render with whatever size the call site needs. */
  icon: LucideIcon;
  category: NodeCategory;
  defaultSize: { width: number; height: number };
  /** Called at creation time (so date-relative defaults are fresh). */
  defaultData: () => Record<string, unknown>;
}

// Adding a node type = one component file + one entry here.
// Entry order within a category is the NodePicker display order.
export const NODE_REGISTRY: Record<NodeType, NodeDef> = {
  // Create
  note: {
    component: withNodeBoundary(NoteNode), label: "Note", icon: FileText, category: "create",
    defaultSize: { width: 240, height: 180 },
    defaultData: () => ({ title: "New Note", content: "" }),
  },
  "sticky-note": {
    component: withNodeBoundary(StickyNoteNode), label: "Sticky", icon: StickyNote, category: "create",
    defaultSize: { width: 200, height: 200 },
    defaultData: () => ({ content: "", color: "yellow" }),
  },
  markdown: {
    component: withNodeBoundary(MarkdownNode), label: "Markdown", icon: Hash, category: "create",
    defaultSize: { width: 360, height: 300 },
    defaultData: () => ({ content: "# Hello\n\nWrite **markdown** here." }),
  },
  "code-snippet": {
    component: withNodeBoundary(CodeSnippetNode), label: "Code", icon: Code2, category: "create",
    defaultSize: { width: 360, height: 280 },
    defaultData: () => ({ title: "Snippet", language: "typescript", code: "" }),
  },
  file: {
    component: withNodeBoundary(FileNode), label: "Document", icon: BookOpen, category: "create",
    defaultSize: { width: 280, height: 220 },
    defaultData: () => ({ fileName: "", fileType: "", content: "", truncated: false }),
  },
  "daily-journal": {
    component: withNodeBoundary(DailyJournalNode), label: "Journal", icon: BookMarked, category: "create",
    defaultSize: { width: 320, height: 380 },
    defaultData: () => ({ entries: [] }),
  },
  voice: {
    component: withNodeBoundary(VoiceNode), label: "Voice", icon: Mic, category: "create",
    defaultSize: { width: 240, height: 200 },
    defaultData: () => ({ transcript: "", audio_url: null }),
  },
  stt: {
    component: withNodeBoundary(STTNode), label: "Transcribe", icon: Mic2, category: "create",
    defaultSize: { width: 240, height: 200 },
    defaultData: () => ({ transcript: "" }),
  },
  tts: {
    component: withNodeBoundary(TTSNode), label: "Read Aloud", icon: Volume2, category: "create",
    defaultSize: { width: 240, height: 220 },
    defaultData: () => ({ text: "", voice: "Zephyr" }),
  },
  "ai-chat": {
    component: withNodeBoundary(AiChatNode), label: "AI Chat", icon: Bot, category: "create",
    defaultSize: { width: 300, height: 380 },
    defaultData: () => ({ conversations: [], active_conversation_id: null, model: "", system_prompt: "" }),
  },
  // Plan
  task: {
    component: withNodeBoundary(TaskNode), label: "Task", icon: CheckSquare, category: "plan",
    defaultSize: { width: 240, height: 200 },
    defaultData: () => ({ title: "New Task", items: [], due_date: null, priority: "medium", status: "todo" }),
  },
  kanban: {
    component: withNodeBoundary(KanbanNode), label: "Kanban", icon: Columns2, category: "plan",
    defaultSize: { width: 520, height: 400 },
    defaultData: () => ({ columns: [{ id: "todo", title: "To Do", cards: [] }, { id: "inprog", title: "In Progress", cards: [] }, { id: "done", title: "Done", cards: [] }] }),
  },
  "habit-tracker": {
    component: withNodeBoundary(HabitTrackerNode), label: "Habits", icon: ListChecks, category: "plan",
    defaultSize: { width: 300, height: 340 },
    defaultData: () => ({ habits: [], completions: {} }),
  },
  calendar: {
    component: withNodeBoundary(CalendarNode), label: "Calendar", icon: CalendarDays, category: "plan",
    defaultSize: { width: 280, height: 300 },
    defaultData: () => ({ linked_canvas_id: null }),
  },
  "project-hub": {
    component: withNodeBoundary(ProjectHubNode), label: "Project", icon: Layers, category: "plan",
    defaultSize: { width: 240, height: 160 },
    defaultData: () => ({ linked_project_id: null, description: "" }),
  },
  calculator: {
    component: withNodeBoundary(CalculatorNode), label: "Calculator", icon: Calculator, category: "plan",
    defaultSize: { width: 260, height: 360 },
    defaultData: () => ({ expression: "", result: "0", history: [] }),
  },
  // Think
  "mental-model": {
    component: withNodeBoundary(MentalModelNode), label: "Mental Model", icon: Brain, category: "think",
    defaultSize: { width: 320, height: 420 },
    defaultData: () => ({ model_id: null, prompt_responses: {}, summary: "" }),
  },
  // Time
  clock: {
    component: withNodeBoundary(ClockNode), label: "Clock", icon: Clock, category: "time",
    defaultSize: { width: 200, height: 160 },
    defaultData: () => ({ mode: "clock", timer_seconds: 300 }),
  },
  pomodoro: {
    component: withNodeBoundary(PomodoroNode), label: "Pomodoro", icon: Timer, category: "time",
    defaultSize: { width: 220, height: 300 },
    defaultData: () => ({ work_minutes: 25, break_minutes: 5, long_break_minutes: 15, sessions_before_long: 4, started_at: null, phase: "idle", session_count: 0, paused_remaining_ms: null }),
  },
  countdown: {
    component: withNodeBoundary(CountdownNode), label: "Countdown", icon: AlarmClock, category: "time",
    defaultSize: { width: 240, height: 170 },
    defaultData: () => ({ title: "Countdown", target_date: new Date(Date.now() + 7 * 86400000).toISOString(), show_seconds: true }),
  },
  hourglass: {
    component: withNodeBoundary(HourglassNode), label: "Hourglass", icon: Hourglass, category: "time",
    defaultSize: { width: 200, height: 280 },
    defaultData: () => ({ title: "Focus", duration_minutes: 25, started_at: null, paused_at: null, total_paused_ms: 0 }),
  },
  "world-clock": {
    component: withNodeBoundary(WorldClockNode), label: "World Clock", icon: Globe2, category: "time",
    defaultSize: { width: 240, height: 320 },
    defaultData: () => ({ clocks: [{ id: "utc", label: "UTC", timezone: "UTC" }, { id: "nyc", label: "New York", timezone: "America/New_York" }, { id: "lon", label: "London", timezone: "Europe/London" }] }),
  },
  // Data
  finance: {
    component: withNodeBoundary(FinanceNode), label: "Finance", icon: TrendingUp, category: "data",
    defaultSize: { width: 280, height: 260 },
    defaultData: () => ({ tickers: [] }),
  },
  currency: {
    component: withNodeBoundary(CurrencyNode), label: "Currency", icon: ArrowLeftRight, category: "data",
    defaultSize: { width: 260, height: 240 },
    defaultData: () => ({ base: "USD", targets: ["EUR", "GBP", "JPY", "INR"], amount: 1, rates: {}, last_fetched: null }),
  },
  chart: {
    component: withNodeBoundary(ChartNode), label: "Chart", icon: BarChart2, category: "data",
    defaultSize: { width: 340, height: 280 },
    defaultData: () => ({ title: "Chart", chart_type: "bar", color: "var(--ms-accent)", dataset: [{ label: "A", value: 4 }, { label: "B", value: 7 }, { label: "C", value: 3 }, { label: "D", value: 9 }] }),
  },
  weather: {
    component: withNodeBoundary(WeatherNode), label: "Weather", icon: Cloud, category: "data",
    defaultSize: { width: 220, height: 240 },
    defaultData: () => ({ city: "", latitude: null, longitude: null, units: "celsius" }),
  },
  // Connect / More
  "web-link": {
    component: withNodeBoundary(WebLinkNode), label: "Web Link", icon: Link2, category: "connect",
    defaultSize: { width: 320, height: 260 },
    defaultData: () => ({ url: "", title: "" }),
  },
  "bookmark-cluster": {
    component: withNodeBoundary(BookmarkClusterNode), label: "Bookmarks", icon: Bookmark, category: "connect",
    defaultSize: { width: 320, height: 280 },
    defaultData: () => ({ bookmarks: [], columns: 3 }),
  },
  "rss-reader": {
    component: withNodeBoundary(RSSReaderNode), label: "RSS Feed", icon: Rss, category: "connect",
    defaultSize: { width: 300, height: 360 },
    defaultData: () => ({ feed_url: "", feed_title: "", items: [], last_fetched: null }),
  },
  "github-issues": {
    component: withNodeBoundary(GitHubIssuesNode), label: "GitHub", icon: GitBranch, category: "connect",
    defaultSize: { width: 320, height: 360 },
    defaultData: () => ({ repo: "", token: "", filter: "open", issues: [], last_fetched: null }),
  },
  cosmic: {
    component: withNodeBoundary(CosmicNode), label: "Cosmic", icon: Sparkles, category: "connect",
    defaultSize: { width: 420, height: 380 },
    defaultData: () => ({ mode: "haptic" }),
  },
  divider: {
    component: withNodeBoundary(DividerNode), label: "Divider", icon: SeparatorHorizontal, category: "connect",
    defaultSize: { width: 480, height: 40 },
    defaultData: () => ({ label: "Section", showLabel: true, orientation: "horizontal", color: "", fillColor: "", effect: "solid", labelPosition: "start" }),
  },
  group: {
    component: withNodeBoundary(GroupNode), label: "Group", icon: Group, category: "connect",
    defaultSize: { width: 400, height: 300 },
    defaultData: () => ({ label: "Group", color: "" }),
  },
  video: {
    component: withNodeBoundary(VideoNode), label: "Video", icon: PlayCircle, category: "connect",
    defaultSize: { width: 380, height: 300 },
    defaultData: () => ({ src: "", fileName: "", srcType: "" }),
  },
};

const ALL_TYPES = Object.keys(NODE_REGISTRY) as NodeType[];

/** React Flow nodeTypes map, derived from the registry. */
export const nodeTypes: Record<string, React.ComponentType<any>> = Object.fromEntries(
  ALL_TYPES.map((t) => [t, NODE_REGISTRY[t].component]),
);

export function getDefaultSize(type: NodeType): { width: number; height: number } {
  return NODE_REGISTRY[type].defaultSize;
}

export function getDefaultData(type: NodeType): Record<string, unknown> {
  return NODE_REGISTRY[type].defaultData();
}

export function nodeOptionsForCategory(category: NodeCategory): { type: NodeType; def: NodeDef }[] {
  return ALL_TYPES.filter((t) => NODE_REGISTRY[t].category === category)
    .map((t) => ({ type: t, def: NODE_REGISTRY[t] }));
}
