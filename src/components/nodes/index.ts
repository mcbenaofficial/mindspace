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
import { withNodeBoundary } from "./NodeErrorBoundary";

// Every node is memoized and wrapped in an error boundary at registration.
export const nodeTypes = {
  note: withNodeBoundary(NoteNode),
  task: withNodeBoundary(TaskNode),
  calendar: withNodeBoundary(CalendarNode),
  clock: withNodeBoundary(ClockNode),
  "ai-chat": withNodeBoundary(AiChatNode),
  voice: withNodeBoundary(VoiceNode),
  stt: withNodeBoundary(STTNode),
  tts: withNodeBoundary(TTSNode),
  "project-hub": withNodeBoundary(ProjectHubNode),
  "web-link": withNodeBoundary(WebLinkNode),
  cosmic: withNodeBoundary(CosmicNode),
  file: withNodeBoundary(FileNode),
  video: withNodeBoundary(VideoNode),
  divider: withNodeBoundary(DividerNode),
  finance: withNodeBoundary(FinanceNode),
  weather: withNodeBoundary(WeatherNode),
  calculator: withNodeBoundary(CalculatorNode),
  group: withNodeBoundary(GroupNode),
  "sticky-note": withNodeBoundary(StickyNoteNode),
  countdown: withNodeBoundary(CountdownNode),
  hourglass: withNodeBoundary(HourglassNode),
  "world-clock": withNodeBoundary(WorldClockNode),
  currency: withNodeBoundary(CurrencyNode),
  "code-snippet": withNodeBoundary(CodeSnippetNode),
  markdown: withNodeBoundary(MarkdownNode),
  pomodoro: withNodeBoundary(PomodoroNode),
  "habit-tracker": withNodeBoundary(HabitTrackerNode),
  kanban: withNodeBoundary(KanbanNode),
  "daily-journal": withNodeBoundary(DailyJournalNode),
  "github-issues": withNodeBoundary(GitHubIssuesNode),
  "bookmark-cluster": withNodeBoundary(BookmarkClusterNode),
  "rss-reader": withNodeBoundary(RSSReaderNode),
  chart: withNodeBoundary(ChartNode),
};
