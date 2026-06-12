# Phase 2 — The Brain: Embeddings, RAG Chat, Inbox Triage, Knowledge Graph

- **Status:** 🟢 Complete
- **Date raised:** 2026-06-11
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-11 — revised plan (incl. daily digest) approved via in-session prompt
- **Release version:** v1.5.0

## Requested Feature
The brain-dump vision from the original audit request: *"use all data from the app to form a knowledge graph. This is a brain dump zone. The user dumps ideas in and it gets triaged and added to the right knowledge area and can be invoked by the user."* One release delivering: semantic memory over all node content, chat-with-your-whole-vault with citations, an Inbox where captures are auto-filed by AI (undoable), and a knowledge graph with backlinks and a graph view.

## Clarifications (Q&A)
- **Embeddings location?** → **Local via LM Studio** (`/v1/embeddings`). Private, free. Requires an embedding model (e.g. `nomic-embed-text`) loaded in LM Studio; when unavailable, semantic features degrade gracefully to FTS keyword search and triage pauses.
- **Triage behavior?** → **Auto-file with undo.** Items move automatically; a sidebar digest shows what went where; each filing is one undoable history step. Low-confidence items stay in the Inbox.
- **Delivery?** → **All in one release** (v1.5.0): RAG chat + inbox triage + knowledge graph/backlinks/graph view ship together.
- **Revision (2026-06-11)**: user asked to also include **daily resurfacing / journal digest** in this release (was deferred to Phase 2.5) — added as step 11.

## Architecture decisions
- **Vector store**: `chunks` + `vectors` tables in the existing SQLite (vectors as base64-encoded Float32Array — the sqlite-vec extension can't be loaded through tauri-plugin-sql). Search is in-memory brute-force cosine over a decoded vector cache (~15 MB at 5k chunks, <50 ms) — no native code needed; revisit if vaults outgrow it.
- **Incremental pipeline**: chunk (~800 chars, overlap) the same extracted text the FTS index uses; content-hash per chunk so only changed chunks re-embed; throttled backfill on launch; embed queue runs in the background and never blocks the UI.
- **Hybrid retrieval**: FTS5 top-N ∪ vector top-N, deduped by node, score-merged — keyword search keeps working with LM Studio off.
- **Inbox**: a system "📥 Inbox" project/canvas auto-created on first use; Quick Capture defaults to it (toggle to capture into the current canvas instead). Triage operates on Inbox-canvas nodes; filing = moving the node to the target canvas (new `moveNodeToCanvas` store action, history-recorded).
- **Cross-canvas links**: semantic/accepted links between nodes on different canvases stored in a new `links` table (canvas edges stay as-is); the backlinks rail reads both.

## Plan
1. **Schema** (`src/lib/db.ts`): `chunks`, `vectors`, `entities`, `mentions`, `links`, `triage_log` tables + indexes.
2. **Embedding pipeline** (`src/lib/brain/embeddings.ts`): chunker, content hashing, LM Studio embeddings client (model from new `lmstudio_embedding_model` setting, auto-detected from `/v1/models` when blank), background queue + launch backfill, Float32 vector cache, cosine top-K.
3. **Hybrid retrieval** (`src/lib/brain/retrieve.ts`): FTS + vector merge with node metadata and passage snippets.
4. **Brain slice** (`src/store/slices/brainSlice.ts`): index status/stats, triage log, inbox count, `moveNodeToCanvas`, triage controls.
5. **Brain chat**: 🧠 toggle in AiChatNode + modal AiChatEditor. When on, the user query is embedded, top ~8 passages injected as system context with `[ref:nodeId]` markers; assistant citations render as clickable chips that jump to the source node (reuses `pendingFocusNodeId`). Works alongside streaming.
6. **Inbox + Quick Capture**: system Inbox bootstrap; capture destination toggle (default Inbox); inbox badge in sidebar.
7. **Triage agent** (`src/lib/brain/triage.ts`): LM Studio classification (target project/canvas from names + content samples, node type, title, confidence). Auto-file ≥ threshold as one undoable batch; below threshold stays put; `triage_log` row + sidebar digest ("3 filed · review"). Runs after capture and on demand; paused when LM Studio is offline (with a pause/resume toggle in Settings).
8. **Backlinks / Related rail** (NodeEditorModal right rail): entity-shared nodes, vector-nearest nodes, existing edges/links; "link" button to accept a suggestion (edge if same canvas, `links` row otherwise).
9. **Entity extraction**: throttled local-model pass over changed nodes filling `entities`/`mentions`; heuristic fallback (hashtags, capitalized phrases) when offline.
10. **Graph view**: read-only modal (⌘⇧G / sidebar button) rendering nodes + semantic links via React Flow; click jumps to node.
11. **Daily digest & resurfacing** (`src/lib/brain/digest.ts`): generated once per day on first launch (date-keyed `digests` table). Contents: (a) yesterday's triage activity, (b) resurface candidates — nodes untouched for 21+ days that are semantically similar to what you worked on in the last 7 days ("you captured this 3 weeks ago — still relevant?"), (c) stale/overdue tasks. LM Studio writes a short narrative summary (offline fallback: plain list). Surfaced as a "Today" panel from the sidebar with jump links and dismiss; also insertable into a Daily Journal node with one click.
12. **Settings → Brain**: embedding model field + test, index stats, rebuild button, triage auto-file pause, confidence threshold, digest on/off.
13. v1.5.0 bump, CHANGELOG, Settings release notes; tsc + vite build + cargo check; close out request + ledger + metrics.

## Out of Scope
- Cloud embeddings (OpenRouter) and any data leaving the machine.
- Entity merge/edit UI; editable graph view.
- Multi-device sync (Phase 3); store re-architecture beyond the brain slice.

## Acceptance Criteria
- [ ] With an embedding model loaded, a brain-toggled chat answers questions about content from *other* projects, with citation chips that jump to the source node.
- [ ] With LM Studio fully offline: search, capture, and chat still work; brain features show a clear "offline" state instead of errors.
- [ ] Quick Capture lands in Inbox by default; within ~10s the item is auto-filed to a sensible canvas, the sidebar digest shows it, and ⌘Z brings it back to the Inbox.
- [ ] Editing a node re-embeds only its changed chunks (no full rebuild).
- [ ] Backlinks rail shows related nodes for a note with overlapping content; accepting a suggestion creates a visible link.
- [ ] Graph view renders and jump-on-click works.
- [ ] First launch of a new day produces a Today digest with triage recap + resurfaced items; links jump to nodes; it never blocks startup.
- [ ] tsc + vite build + cargo check pass clean.

## Progress
- [x] Step 1 — Brain schema in `src/lib/db.ts`: `chunks`, `vectors`, `entities`, `mentions`, `links`, `triage_log`, `digests` + indexes.
- [x] Step 2 — `src/lib/brain/embeddings.ts`: word-boundary chunker (800/100 overlap), content hashing, LM Studio embeddings client with model auto-detect, background queue + launch backfill (pauses cleanly offline), base64 Float32 storage, in-memory cosine cache, `nearestNodes`, `rebuildBrainIndex`.
- [x] Step 3 — `src/lib/brain/retrieve.ts`: vector ∪ FTS hybrid, deduped per node, passage snippets with canvas/project names.
- [x] Step 4 — `src/store/slices/brainSlice.ts`: status/counts, inbox count, triage log, `ensureInbox` (system 📥 Inbox bootstrap), `moveNodeToCanvas` with history recording for off-canvas nodes; `updateNode` now handles canvas-membership changes in both directions (file away / undo back).
- [x] Step 5 — Brain chat in AiChatNode + modal AiChatEditor: 🧠 toggle, retrieval-injected system context with `[ref:ID]` markers, citation chips (jump via shared `jumpToNode`), markers stripped from rendered text, works with streaming.
- [x] Step 6 — QuickCapture: Inbox/Here destination toggle (Inbox default), full dump preserved as note body, post-capture triage trigger; sidebar Today button with inbox badge + graph button.
- [x] Step 7 — `src/lib/brain/triage.ts`: canvas candidates with sample titles, JSON classification at temperature 0, threshold gate, per-item undoable batch (move + retitle), `triage_log`, pause-on-offline.
- [x] Step 8 — Related strip on every node editor: edges + cross-canvas `links` + entity-overlap + vector-similar suggestions with accept-to-link.
- [x] Step 9 — `src/lib/brain/entities.ts`: throttled LLM extraction with hashtag/Capitalized-phrase heuristic fallback, scheduled after re-embeds.
- [x] Step 10 — `GraphViewModal` (⌘⇧G + sidebar button): active project's nodes grouped by canvas, solid edges vs dashed links, click-to-jump.
- [x] Step 11 — `src/lib/brain/digest.ts` + `TodayPanel`: date-keyed daily generation (4s after boot), triage recap, vector-resurfaced old nodes, stale tasks, LM prose summary with offline fallback, insert-into-Daily-Journal.
- [x] Step 12 — Settings → Brain: status dot + chunk count, rebuild button, embedding model override, triage toggle + confidence slider, digest toggle.
- [x] Step 13 — v1.5.0 in package.json/tauri.conf.json/Settings notes; CHANGELOG entry.

## Complete Summary
The brain-dump vision from the original request is implemented end-to-end, fully local: capture anything into the Inbox and AI files it where it belongs (undoably); ask the chat anything and it answers from your whole vault with citations; every node shows its related material; the graph view shows the structure; and each morning the Today panel resurfaces what matters.

## Technical Overview of the Build
New module tree `src/lib/brain/` (embeddings, retrieve, triage, entities, digest, navigation) + `brainSlice`. Embeddings: chunk→hash→embed pipeline with a single background queue; vectors as base64 Float32 TEXT; cosine over an in-memory cache (no native deps). Retrieval merges vector chunk hits with FTS node hits. Triage classifies against canvas candidates (names + sampled titles) and files via `moveNodeToCanvas`, which records history even for nodes outside the active canvas; `updateNode` gained canvas-membership semantics so undo restores items to a visible Inbox. Entities extracted post-embed (LLM or heuristics) into `entities`/`mentions`; `links` stores accepted cross-canvas relations. Digest is date-keyed in SQLite and generated once per day, 4s after boot. Everything that touches LM Studio catches failure and degrades to keyword-only/paused states surfaced via `brainStatus`.

## Functional Overview of the Build
- ⌘⇧Space → dump a thought → lands in 📥 Inbox → ~10s later it's on the right canvas (sidebar badge + Today panel show what moved; ⌘Z brings it back).
- 🧠 button in any chat → answers draw on every project; chips under replies jump to sources.
- Open any node → Related strip shows linked, entity-shared, and semantically similar nodes; + accepts a suggestion as a permanent link.
- ⌘⇧G → knowledge graph of the active project; Sunrise button → Today digest.
- Settings → Brain: status, rebuild, model override, triage confidence, digest toggle.

## Expected Behaviour
Per acceptance criteria above.

## Actual Behaviour
`tsc --noEmit` (checked incrementally after each subsystem), `npm run build`, and `cargo check` all pass clean. **Live verification not run** — brain features depend on a running LM Studio with an embedding model loaded, which only exists on the user's machine. Highest-value manual checks: embedding model auto-detection against your LM Studio, triage filing quality on real dumps, and undo of an auto-filed item while the Inbox canvas is not active.

## Test Cases
| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Vault indexing | Launch with embedding model loaded | Settings → Brain shows "ready · N chunks" | Not run | Not run |
| 2 | Brain chat cross-project | 🧠 on, ask about another project's note | Answer uses it; citation chip jumps there | Not run | Not run |
| 3 | Offline degradation | Quit LM Studio, search + chat + capture | All work; Brain shows offline; no errors | Not run | Not run |
| 4 | Inbox auto-file | ⌘⇧Space, dump text, wait ~10s | Item moves to sensible canvas; badge + digest update | Not run | Not run |
| 5 | Triage undo | ⌘Z after auto-file | Item back in Inbox (even if Inbox not active) | Not run | Not run |
| 6 | Low-confidence dump | Capture gibberish | Stays in Inbox, logged as kept | Not run | Not run |
| 7 | Incremental re-embed | Edit one note | Only its chunks re-embed (no full rebuild) | Not run | Not run |
| 8 | Related strip | Open note with overlapping content | Suggestions appear; + creates link; chip jumps | Not run | Not run |
| 9 | Graph view | ⌘⇧G | Canvas-grouped graph renders; click jumps | Not run | Not run |
| 10 | Daily digest | First launch of a new day | Today panel: recap + resurfaced + stale; insert-to-journal works | Not run | Not run |
| 11 | Capture body fidelity | Multi-line dump as note | Full text in note body, first line as title | Not run | Not run |
| 12 | tsc / build / cargo | run all three | Pass | All pass | ✅ Pass |
