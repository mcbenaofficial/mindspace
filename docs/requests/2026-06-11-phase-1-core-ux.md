# Phase 1 — Core UX: Global Search, Undo/Redo, AI Streaming

- **Status:** 🔵 In Progress
- **Date raised:** 2026-06-11
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-11 — "Approve with full scope" (alignment toolbar, lock badge, and store-slicing refactor included)
- **Release version:** _assigned on completion_

## Requested Feature
Execute Phase 1 of the audit plan: make MindSpace feel like a professional tool — find anything instantly, undo any canvas mistake, see AI responses stream in live, and basic power-user shortcuts.

## Clarifications (Q&A)
No blocking questions. Implementation decisions (recorded for review):
- **Search engine**: SQLite FTS5 virtual table (`search_index`) over extracted title+body text of every node, rebuilt on launch and incrementally updated on node add/update/delete. Graceful fallback to a plain table + LIKE queries if the bundled SQLite lacks FTS5.
- **Search UI**: Cmd+K palette (overlay modal), fuzzy-prefix matching per word, type icon + snippet + project/canvas breadcrumb per result, ↑/↓/Enter/Esc keyboard flow. Enter jumps: switches project/canvas if needed, centers the canvas on the node, selects it.
- **Undo scope (v1)**: node add/delete/update (move, resize, data edits, lock, group membership) and edge add/delete on the canvas. Coalesces rapid updates to the same node (e.g. typing) within 1.5s. Cap 100 entries. Canvas/project CRUD and imports are NOT undoable in v1. Cmd+Z/Cmd+Shift+Z ignored while focus is in an input/textarea/contentEditable (TipTap keeps its own undo).
- **Streaming**: new `http_post_stream` Tauri command (same host allowlist as `http_post`) emitting chunk events; shared `streamChatCompletion()` helper parses OpenAI-style SSE and powers BOTH the canvas AiChatNode and the modal AiChatEditor; browser fallback uses fetch ReadableStream. Tokens render live into the bubble; the conversation is persisted once at stream end.
- **Shortcuts**: Cmd+D duplicate selected node(s), Cmd+G group selected (canvas-focused only).

## Plan
1. `src/lib/search.ts` — FTS5 init/rebuild, per-type text extraction, upsert/remove, query with join to canvas/project names; LIKE fallback.
2. Store: hook search index into add/update/delete actions; add `searchOpen`, `pendingFocusNodeId` UI state.
3. Store: history slice — typed entries (add/del/upd/addEdge/delEdge), `undo()`/`redo()`, `restoreNode`/`restoreEdge` raw helpers, isRestoring guard, coalescing.
4. `src/components/modals/SearchPalette.tsx` — palette UI + result navigation + jump logic.
5. App.tsx — global Cmd+K and Cmd+Z/Cmd+Shift+Z listeners (editable-focus guard), mount palette.
6. Canvas.tsx — effect to center/select `pendingFocusNodeId`; Cmd+D duplicate; Cmd+G group in wrapper key handler.
7. Rust: `http_post_stream` (allowlisted, connect-timeout only, chunk/end events); `futures-util` dep.
8. `src/lib/aiStream.ts` — shared streaming helper (Tauri events + SSE parse + fetch fallback + error-body capture).
9. AiChatNode.tsx + NodeEditorModal AiChatEditor — stream tokens into the live bubble, persist at end, Stop button.
10. Store slicing refactor: split the monolithic store into data / ui / settings / history slices (zustand slice pattern), keeping the `useStore` API identical.
11. Alignment toolbar: floating toolbar when ≥2 nodes selected — align left/center/right/top/middle/bottom, distribute horizontally/vertically; one undo step per action (batched history entries).
12. Lock badge: padlock chip on locked nodes via `toRFNode` className + CSS (no per-component edits).
13. Version bump to v1.4.0, CHANGELOG, Settings release notes; verify with tsc + vite build + cargo check.

## Out of Scope
- Undo for canvas/project operations and imports.
- Semantic/embedding search (Phase 2).

## Acceptance Criteria
- [ ] Cmd+K finds nodes by title and content across all projects; Enter lands on the node, centered and selected.
- [ ] Search stays in sync after creating/editing/deleting nodes, and survives restarts (rebuild on launch).
- [ ] Cmd+Z undoes node moves, deletes, edits, and edge changes; Cmd+Shift+Z redoes; text editing inside editors is untouched.
- [ ] AI chat responses appear token-by-token in both the canvas node and the modal; a Stop button halts generation; final text is persisted.
- [ ] Cmd+D duplicates selection; Cmd+G groups it.
- [ ] tsc + vite build + cargo check pass clean.

## Progress
_(updated as steps complete)_
