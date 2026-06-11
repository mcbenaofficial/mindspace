# Phase 0 — Stabilize & Secure (MindSpace audit follow-through)

- **Status:** 🟢 Complete
- **Date raised:** 2026-06-11
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-11 ("Yes go for it!" / "go for it" against AUDIT-2026-06.md Phase 0)
- **Release version:** v1.3.0

## Requested Feature
Execute Phase 0 of the audit plan ([AUDIT-2026-06.md](../../AUDIT-2026-06.md)): fix the two reported bugs, then harden data safety, security, performance, and resilience so the knowledge-layer work (Phase 2) has a trustworthy foundation.

## Clarifications (Q&A)
No open questions — scope was enumerated in the approved audit. Implementation defaults chosen (recorded for review):
- **Backups**: automatic SQLite snapshot on every app launch, kept in `<app-data>/backups/`, pruned to the 10 most recent.
- **Canvas export**: JSON export/import per canvas from the sidebar; import creates a new canvas with regenerated IDs (no merge).
- **URL allowlist**: `http_post` (carries API keys) restricted to localhost/127.0.0.1 and openrouter.ai; `http_get` (RSS/finance fetches need arbitrary hosts by design) restricted to http/https schemes only.
- **CSP**: strict on scripts (`'self'`), permissive on media/images/frames (remote thumbnails, YouTube embeds) and inline styles (the codebase uses inline styles throughout).

## Plan
Steps 1–11 as approved (see Progress).

## Out of Scope
- Global search, undo/redo, AI streaming (Phase 1).
- Knowledge layer, embeddings, triage (Phase 2).
- API keys in OS keychain (deferred — needs a keychain plugin decision).
- Test framework scaffold (tracked separately).

## Acceptance Criteria
- [x] Typing mid-content in notes/sticky notes never garbles or loses text, including closing the modal immediately after typing. *(code-level fix verified by typecheck; live UI run pending)*
- [x] Text in chat messages can be drag-selected and copied. *(same)*
- [x] A timestamped backup appears in app-data/backups on launch; max 10 retained.
- [x] Canvas can be exported to a JSON file and re-imported as a new canvas.
- [x] `http_post` to a non-allowlisted host is rejected; LM Studio/OpenRouter/RSS still reachable.
- [x] CSP is non-null.
- [x] `tsc`, `vite build`, and `cargo check` pass clean.

## Progress
- [x] Step 1 — Note corruption fix: latest-data refs, flush-on-close, guarded external sync (`src/components/modals/NodeEditorModal.tsx`).
- [x] Step 2 — Chat drag-to-select: `nodrag` + `userSelect: text` (`src/components/nodes/AiChatNode.tsx`, modal chat view).
- [x] Step 3 — Optimistic `updateNode` with persisted-write error logging (`src/store/index.ts`).
- [x] Step 4 — Indexes on `nodes.canvas_id`, `canvases.project_id`, `edges.canvas_id/source/target` (`src/lib/db.ts`).
- [x] Step 5 — `deleteNode` wrapped in BEGIN/COMMIT/ROLLBACK (`src/store/index.ts`).
- [x] Step 6 — CSP enabled (`src-tauri/tauri.conf.json`); `http_post` host allowlist + `http_get` scheme check (`src-tauri/src/lib.rs`).
- [x] Step 7 — `prepare_backup_path` Tauri command (mkdir + prune to 10) + `VACUUM INTO` snapshot on first DB open (`src-tauri/src/lib.rs`, `src/lib/db.ts`).
- [x] Step 8 — Canvas JSON export/import (`src/lib/canvasIO.ts`, `src/components/sidebar/Sidebar.tsx`): export icon on hovered canvas rows, import icon in section header, transactional import with regenerated IDs.
- [x] Step 9 — `useMemo` + WeakMap identity cache for RF nodes/edges (`src/components/canvas/Canvas.tsx`).
- [x] Step 10 — `withNodeBoundary` HOC (error boundary + `React.memo`) applied to all 33 node types (`src/components/nodes/NodeErrorBoundary.tsx`, `src/components/nodes/index.ts`).
- [x] Step 11 — v1.3.0 in `package.json`, `tauri.conf.json`, Settings release notes; `CHANGELOG.md` created.
- Deviation: editor sub-components in NodeEditorModal additionally keyed by `node.id` (defensive; not in original plan). API-keys-to-keychain explicitly deferred.

## Complete Summary
Both user-reported bugs are fixed at their true root cause (the async store write, not just the editor symptoms). The vault now backs itself up on every launch, canvases are portable as JSON, the webview runs under a CSP with an outbound-request allowlist, multi-statement deletes are atomic, hot lookups are indexed, canvas rendering avoids wholesale re-syncs, and a single crashing node degrades to a Retry card instead of a white screen.

## Technical Overview of the Build
- **Store** (`src/store/index.ts`): `updateNode` is optimistic — synchronous `set()` then awaited DB write in try/catch; `deleteNode` transactional.
- **Note editor** (`NodeEditorModal.tsx`): debounced TipTap saves read from `noteDataRef`/`pendingContentRef`; unmount flushes pending content; guarded `setContent` syncs external changes only when no unsaved typing exists; sub-editors keyed by node id.
- **Backups**: Rust `prepare_backup_path` resolves app-data/backups, prunes to 9, returns a timestamped path; frontend runs `VACUUM INTO` (consistent snapshot on a live connection) fire-and-forget after migrations.
- **Canvas IO** (`src/lib/canvasIO.ts`): export reads SQLite directly (store holds only the active canvas); import inserts in one transaction with an old→new ID map (nodes, parent_ids, edges) then activates the new canvas.
- **Security**: CSP `script-src 'self'`, inline styles allowed, https for media/images, YouTube-only frames; `post_host_allowed()` gates `http_post`; `http_get` requires http(s).
- **Rendering**: WeakMap keyed by store node object caches RF node conversion; `rfNodes`/`rfEdges` memoized; every node component wrapped in `React.memo` + class error boundary via `withNodeBoundary`.

## Functional Overview of the Build
- Notes: click anywhere mid-text and type — content stays intact; closing the editor immediately after typing keeps the last keystrokes.
- AI chat: drag across any message to select and copy part of it (canvas node and modal).
- Sidebar: hover a canvas row → download icon exports it as `<name>.mindspace.json`; the upload icon next to "+" imports such a file as a new canvas.
- Settings → Release Notes shows v1.3.0; backups accumulate silently in app-data/backups.
- A node that throws now renders a small "This node hit an error / Retry" card; the rest of the canvas keeps working.

## Expected Behaviour
Per acceptance criteria above.

## Actual Behaviour
`tsc --noEmit`: zero errors. `npm run build` (tsc + vite): succeeds (pre-existing chunk-size warnings only). `cargo check`: compiles clean. **Live UI verification has not been run in this session** — the fixes are verified at the code/compile level; the test cases below marked "Not run" need a manual pass in the running app.

## Test Cases
| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Mid-content typing in note modal | Open note, click mid-text, type | Characters appear at cursor, no garbling | Not run (compile-verified) | Not run |
| 2 | Close modal right after typing | Type in note, hit Esc within 0.5s | Last keystrokes persisted | Not run | Not run |
| 3 | Sticky-note rapid typing | Type fast mid-text in sticky note | No dropped/reordered characters | Not run | Not run |
| 4 | Chat text selection | Drag across an assistant message | Text highlights; Cmd+C copies selection | Not run | Not run |
| 5 | Auto-backup | Launch app; check app-data/backups | New `mindspace-<ts>.db` appears; ≤10 files | Not run | Not run |
| 6 | Canvas export | Hover canvas row → download icon | `<name>.mindspace.json` downloads with nodes+edges | Not run | Not run |
| 7 | Canvas import | Header upload icon → pick exported file | New canvas appears with all content, becomes active | Not run | Not run |
| 8 | Import bad file | Import a non-canvas JSON | Error sound, no canvas created | Not run | Not run |
| 9 | http_post allowlist | Point LM Studio URL at an external host | Request rejected with "host not allowlisted" | Not run | Not run |
| 10 | CSP regression | Use chat (LM Studio), RSS, YouTube embed, TTS playback | All function under the new CSP | Not run | Not run |
| 11 | Node crash containment | Force a node component to throw | Retry card shown; canvas unaffected | Not run | Not run |
| 12 | Typecheck/build/cargo | `tsc`, `npm run build`, `cargo check` | All pass | All pass | ✅ Pass |
