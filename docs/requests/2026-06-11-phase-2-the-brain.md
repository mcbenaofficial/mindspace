# Phase 2 — The Brain: Embeddings, RAG Chat, Inbox Triage, Knowledge Graph

- **Status:** 🔵 In Progress
- **Date raised:** 2026-06-11
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-11 — revised plan (incl. daily digest) approved via in-session prompt
- **Release version:** _assigned on completion (planned: v1.5.0)_

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
_(updated as steps complete)_
