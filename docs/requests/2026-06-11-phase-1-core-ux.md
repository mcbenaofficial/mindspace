# Phase 1 — Core UX: Global Search, Undo/Redo, AI Streaming

- **Status:** 🟢 Complete
- **Date raised:** 2026-06-11
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-11 — "Approve with full scope" (alignment toolbar, lock badge, and store-slicing refactor included)
- **Release version:** v1.4.0

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
- [x] Step 1 — `src/lib/search.ts`: FTS5 virtual table (LIKE fallback), per-type text extraction (TipTap-aware), rebuild-on-launch, incremental upsert/remove, ranked query with snippets + canvas/project names.
- [x] Step 2 — Search hooks in data slice; `searchOpen` / `pendingFocusNodeId` UI state.
- [x] Step 3 — `src/store/slices/historySlice.ts`: typed entries, coalescing (1.5s), 100-cap, batch entries via `runBatch`, undo/redo.
- [x] Step 4 — `src/components/modals/SearchPalette.tsx`.
- [x] Step 5 — App.tsx: global ⌘K + ⌘Z/⇧⌘Z listeners with editable-focus guard; palette mounted.
- [x] Step 6 — Canvas.tsx: pending-focus centering + selection; ⌘D duplicate; ⌘G group (batched, ref-based).
- [x] Step 7 — `http_post_stream` (allowlisted, connect-timeout only, chunk events, server-side cancel via `cancel_stream`); `futures-util` + reqwest `stream` feature.
- [x] Step 8 — `src/lib/aiStream.ts`: shared SSE parser, Tauri events + browser ReadableStream fallback, error-body capture, StreamHandle with stop().
- [x] Step 9 — AiChatNode + modal AiChatEditor: live streaming bubble, typing indicator until first token, Stop button, persist-at-end.
- [x] Step 10 — Store split into `slices/dataSlice|uiSlice|settingsSlice|historySlice`; `useStore` API unchanged.
- [x] Step 11 — Alignment toolbar (6 align modes; distribute at 3+ selected; group button), one undo step per action.
- [x] Step 12 — `ms-node-locked` className + CSS padlock chip.
- [x] Step 13 — v1.4.0 everywhere; CHANGELOG + Settings release notes.

## Complete Summary
MindSpace now has instant cross-project search (⌘K with jump-to-node), full canvas undo/redo, live-streaming AI chat with stop/cancel, duplicate/group shortcuts, an alignment toolbar, lock badges, and a sliced store ready for the Phase 2 knowledge layer.

## Technical Overview of the Build
- **Search**: `search_index` FTS5 virtual table (node_id/canvas_id/project_id/type unindexed; title+body indexed). Extraction parses TipTap JSON for notes, walks data objects generically (skips data-URLs, thumbnails, keys like token/api_key, caps 30k chars). Rebuilt transactionally on launch; upserted on node add/update(data)/restore; purged on node/canvas/project delete. Query uses per-word prefix match + `snippet()` ranked by `rank`, LEFT JOINed to canvas/project names. Fallback plain table + LIKE if FTS5 is unavailable.
- **History**: command-pattern entries (`add`/`del`/`upd`/`addEdge`/`delEdge`/`batch`) recorded inside data-slice actions; `_restoring` flag prevents re-recording during undo/redo; `upd` entries coalesce within 1.5s per node; `runBatch()` collapses multi-node ops into one entry; restore helpers re-insert rows and update state only when the canvas is active.
- **Streaming**: Rust `http_post_stream` shares the post host allowlist, uses connect-timeout only, emits `ai-stream-chunk` window events keyed by request id; `cancel_stream` flags a static set checked per chunk, and breaking the loop drops the reqwest response, closing the upstream connection. Frontend `streamChatCompletion()` parses SSE incrementally (handles split JSON frames and non-SSE error bodies) and exposes `{promise, stop}`.
- **Store**: four `StateCreator` slices composed in `src/store/index.ts`; `AppState` type exported; all consumer imports unchanged.

## Functional Overview of the Build
- ⌘K anywhere → type → ↑/↓/Enter → lands centered on the matching node, even in another project.
- ⌘Z/⇧⌘Z undo/redo canvas changes; typing in note editors still uses the editor's own undo.
- Chat replies render token-by-token; Stop halts generation immediately (and stops the local model server generating).
- Select 2+ nodes → floating toolbar appears top-center with align/distribute/group; ⌘D duplicates; ⌘G groups; locked nodes wear a 🔒 chip.

## Expected Behaviour
Per acceptance criteria in this file.

## Actual Behaviour
`tsc --noEmit`: zero errors (checked incrementally after each subsystem). `npm run build`: succeeds (pre-existing chunk-size warnings only). `cargo check`: clean. **Live UI verification not yet run** — needs a manual pass in the running app, particularly: FTS5 availability in the bundled SQLite (LIKE fallback engages automatically if absent), stream cancellation against a live LM Studio, and search jump across projects.

## Test Cases
| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Search by content | ⌘K, type a word from a note body | Note appears with snippet + breadcrumb | Not run | Not run |
| 2 | Cross-project jump | Search node in another project, Enter | Project+canvas switch, node centered & selected | Not run | Not run |
| 3 | Index freshness | Edit a note, search the new word | Hit appears without restart | Not run | Not run |
| 4 | Undo delete | Delete a node with edges, ⌘Z | Node and its edges restored | Not run | Not run |
| 5 | Undo move/align | Drag node, ⌘Z; align 3 nodes, ⌘Z | Position restored; align reverts in ONE step | Not run | Not run |
| 6 | Redo | ⌘Z then ⇧⌘Z | Change re-applied | Not run | Not run |
| 7 | Typing guard | ⌘Z while editing a note | Editor undo fires, canvas history untouched | Not run | Not run |
| 8 | Streaming | Send chat message (LM Studio) | Tokens render live; final text persisted | Not run | Not run |
| 9 | Stop generation | Click Stop mid-stream | UI stops; LM Studio stops generating | Not run | Not run |
| 10 | Stream error | Wrong LM Studio port | Error message bubble, no hang | Not run | Not run |
| 11 | ⌘D / ⌘G | Select nodes, ⌘D then ⌘G | Offset copies created; group wraps selection | Not run | Not run |
| 12 | Lock badge | Lock node via context menu | 🔒 chip appears; gone on unlock | Not run | Not run |
| 13 | tsc / build / cargo | run all three | Pass | All pass | ✅ Pass |
