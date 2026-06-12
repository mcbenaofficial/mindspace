export type NodeType =
  | "note"
  | "task"
  | "calendar"
  | "clock"
  | "ai-chat"
  | "voice"
  | "stt"
  | "tts"
  | "project-hub"
  | "web-link"
  | "cosmic"
  | "file"
  | "video"
  | "divider"
  | "finance"
  | "weather"
  | "calculator"
  | "group"
  | "sticky-note"
  | "countdown"
  | "hourglass"
  | "world-clock"
  | "currency"
  | "code-snippet"
  | "markdown"
  | "pomodoro"
  | "habit-tracker"
  | "kanban"
  | "daily-journal"
  | "github-issues"
  | "bookmark-cluster"
  | "rss-reader"
  | "chart"
  | "mental-model";

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
}

export interface Canvas {
  id: string;
  project_id: string;
  name: string;
  viewport_x: number;
  viewport_y: number;
  zoom: number;
  created_at: string;
}

export interface NoteData {
  title: string;
  content: string; // TipTap JSON string
}

export interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TaskData {
  title: string;
  items: TaskItem[];
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in-progress" | "done";
}

export interface CalendarData {
  linked_canvas_id: string | null;
}

export interface ClockData {
  mode: "clock" | "stopwatch" | "timer";
  timer_seconds: number;
}

export interface AiChatAttachment {
  name: string;
  mediaType: "image" | "document";
  mimeType: string;
  thumbnail?: string; // compressed data URL for image preview
}

export interface BrainCitation {
  nodeId: string;
  canvasId: string;
  projectId: string;
  title: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: AiChatAttachment[];
  citations?: BrainCitation[];
}

export interface AiChatConversation {
  id: string;
  title: string;
  messages: AiChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface AiChatData {
  conversations: AiChatConversation[];
  active_conversation_id: string | null;
  model: string;
  system_prompt: string;
  /** When true, replies retrieve context from the whole vault (RAG). */
  brain_enabled?: boolean;
  /** @deprecated legacy field, migrated on first load */
  messages?: AiChatMessage[];
}

export interface VoiceData {
  transcript: string;
  audio_url: string | null;
}

export interface STTData {
  transcript: string;
}

export interface TTSData {
  text: string;
  voice: string;
}

export interface ProjectHubData {
  linked_project_id: string | null;
  description: string;
}

export interface WebLinkData {
  url: string;
  title: string;
}

export type CosmicMode = "haptic" | "hyperspace" | "ko" | "boson" | "vector" | "artifact";

export type FileDocType = "pdf" | "md" | "docx" | "txt" | "";

export interface FileData {
  fileName: string;
  fileType: FileDocType;
  content: string;    // extracted plain text (up to 60k chars)
  truncated: boolean; // true if source was larger
}

export interface CosmicData {
  mode: CosmicMode;
}

export interface DividerData {
  label: string;
  showLabel: boolean;
  orientation: "horizontal" | "vertical";
  color: string;
  fillColor: string;
  effect: "solid" | "gradient" | "striped" | "dotted" | "double";
  labelPosition: "start" | "center" | "end";
}

export interface FinanceData {
  tickers: string[];
}

export interface WeatherData {
  city: string;
  latitude: number | null;
  longitude: number | null;
  units: "celsius" | "fahrenheit";
}

export interface CalculatorData {
  expression: string;
  result: string;
  history: string[];
}

export interface GroupData {
  label: string;
  color: string;
}

// ── New modules ───────────────────────────────────────────────────────────────

export interface StickyNoteData {
  content: string;
  color: string; // background color key
}

export interface CountdownData {
  title: string;
  target_date: string; // ISO string
  show_seconds: boolean;
}

export interface HourglassData {
  title: string;
  duration_minutes: number;
  started_at: string | null;
  paused_at: string | null;
  total_paused_ms: number;
}

export interface WorldClockEntry {
  id: string;
  label: string;
  timezone: string;
}
export interface WorldClockData {
  clocks: WorldClockEntry[];
}

export interface CurrencyData {
  base: string;
  targets: string[];
  amount: number;
  rates: Record<string, number>;
  last_fetched: string | null;
}

export interface CodeSnippetData {
  title: string;
  language: string;
  code: string;
}

export interface MarkdownData {
  content: string;
}

export interface PomodoroData {
  work_minutes: number;
  break_minutes: number;
  long_break_minutes: number;
  sessions_before_long: number;
  started_at: string | null;
  phase: "work" | "break" | "long-break" | "idle";
  session_count: number;
  paused_remaining_ms: number | null;
}

export interface HabitItem {
  id: string;
  name: string;
  color: string;
}
export interface HabitTrackerData {
  habits: HabitItem[];
  completions: Record<string, string[]>; // ISO date → habit ids
}

export interface KanbanCard {
  id: string;
  text: string;
  color?: string;
}
export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}
export interface KanbanData {
  columns: KanbanColumn[];
}

export interface JournalEntry {
  date: string; // YYYY-MM-DD
  content: string;
}
export interface DailyJournalData {
  entries: JournalEntry[];
}

export interface GitHubIssueItem {
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  labels: { name: string; color: string }[];
}
export interface GitHubIssuesData {
  repo: string;
  token: string;
  filter: "open" | "closed" | "all";
  issues: GitHubIssueItem[];
  last_fetched: string | null;
}

export interface BookmarkItem {
  id: string;
  url: string;
  title: string;
}
export interface BookmarkClusterData {
  bookmarks: BookmarkItem[];
  columns: number;
}

export interface RSSItem {
  title: string;
  link: string;
  pub_date: string;
  description: string;
}
export interface RSSReaderData {
  feed_url: string;
  feed_title: string;
  items: RSSItem[];
  last_fetched: string | null;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}
export interface ChartData {
  title: string;
  chart_type: "bar" | "line";
  color: string;
  dataset: ChartDataPoint[];
}

export interface MentalModelData {
  model_id: string | null;                   // null until the spawn picker resolves
  prompt_responses: Record<string, string>;  // keyed by prompt index ("0", "1", …)
  summary: string;                           // TipTap JSON string
}

export type NodeData =
  | NoteData
  | TaskData
  | CalendarData
  | ClockData
  | AiChatData
  | VoiceData
  | STTData
  | TTSData
  | ProjectHubData
  | WebLinkData
  | CosmicData
  | FileData
  | VideoData
  | DividerData
  | FinanceData
  | WeatherData
  | CalculatorData
  | GroupData
  | StickyNoteData
  | CountdownData
  | HourglassData
  | WorldClockData
  | CurrencyData
  | CodeSnippetData
  | MarkdownData
  | PomodoroData
  | HabitTrackerData
  | KanbanData
  | DailyJournalData
  | GitHubIssuesData
  | BookmarkClusterData
  | RSSReaderData
  | ChartData
  | MentalModelData;

export interface VideoData {
  src: string;        // blob URL (session) or direct video URL
  fileName: string;   // original name shown to user
  srcType: "file" | "url" | "";
}

export interface MindNode {
  id: string;
  canvas_id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  locked: boolean;
  parent_id: string | null;
  data: NodeData;
  created_at: string;
  updated_at: string;
}

export interface MindEdge {
  id: string;
  canvas_id: string;
  source: string;
  target: string;
}

export type ThemeId =
  | "dark-default"
  | "midnight-blue"
  | "forest"
  | "warm-sepia"
  | "high-contrast"
  | "custom";

export interface Theme {
  id: ThemeId;
  name: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  dot: string;
}

export interface AppSettings {
  openrouter_api_key: string;
  lmstudio_url: string;
  lmstudio_model: string;
  lmstudio_max_tokens: number;
  quick_capture_hotkey: string;
  theme_id: ThemeId;
  custom_accent: string;
  snap_to_grid: boolean;
  grid_size: number;
  grid_opacity: number; // 0..1 — 0 hides the dot grid entirely
  grid_color: "subtle" | "text" | "accent"; // theme-derived grid color preset
  sound_enabled: boolean;
  sound_volume: number;
  edge_particles: boolean;
  node_color: string;
  node_opacity: number; // 0.4..1 — node card visibility
  canvas_fx_enabled: boolean;
  canvas_fx_style: "hover" | "proximity" | "ripple";
  canvas_fx_intensity: number; // 0..100
  canvas_fx_cards: boolean; // node cards react to the cursor
  canvas_fx_ambient: boolean; // ambient dot/particle layer reacts
  // Brain (Phase 2)
  lmstudio_embedding_model: string; // blank = auto-detect from /v1/models
  triage_enabled: boolean;
  triage_threshold: number; // 0..1 — below this, items stay in the Inbox
  digest_enabled: boolean;
  inbox_project_id: string;
  inbox_canvas_id: string;
}
