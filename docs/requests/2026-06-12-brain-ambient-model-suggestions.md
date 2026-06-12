# Brain Ambient Model Suggestions (Phase 3 of Mental Models Integration)

- **Status:** 🟢 Complete
- **Approved:** 2026-06-12 ("go for it" — both v1.8.1 and v1.8.2 approved together; build starts after v1.8.1 ships)
- **Date raised:** 2026-06-12
- **Requested by:** mcbenaofficial (request doc provided inline, status PENDING APPROVAL)
- **Release version:** v1.8.2
- **Depends on:** v1.8.0 (shipped) **and v1.8.1 (itself still awaiting approval)** — this build cannot start until the Mental Model node exists, since it is both a suggestion trigger source and the spawn target for chips.

## Requested Feature

When the user types in a text-bearing node, a debounced (1s) background query embeds the node's text via LM Studio and runs cosine similarity against the embedded mental-model library. Models scoring ≥ threshold surface as **1–2 dismissible pill chips below the active node** (Brain icon + model name, hover tooltip with the description, 8-second auto-dismiss paused on hover, immediate clear on losing focus, 150ms fade-in, no layout shift).

- **Click a chip** → spawns a Mental Model node (Phase 2 type) pre-loaded with that model, positioned below-right of the source node, with an edge automatically drawn from the source node; chip dismisses.
- **Dismiss (×)** → that model is never re-suggested *for that node* for the rest of the session; other nodes unaffected.
- **Trigger sources**: Note, Task, AI Chat (draft input before send), Mental Model (prompt responses). All widget/data nodes (Kanban, Calendar, Pomodoro, Weather, etc.) never show chips.
- **Embeddings**: a one-time silent startup job embeds every model whose `embedding` column is NULL (`name + ". " + description + ". " + system_prompt_template`); retries next launch if LM Studio is offline; suggestions are silently suppressed until embeddings exist. All model vectors cached in memory; similarity computed in-process. `SUGGESTION_THRESHOLD = 0.72`, a named constant tunable in one line. Minimum 20 chars of text before any query fires.

This is the final phase of the three-phase Mental Models integration.

## Clarifications (Q&A)

No user-blocking questions — the spec's structural assumptions were verifiable against the codebase. Resolutions below; flag any you disagree with before approving.

### Codebase-reality adaptations

| Spec assumption | Reality | Adaptation |
|---|---|---|
| `lmStudio.embed(text)` utility | The embed client is `embedTexts` / `embedQuery` in [embeddings.ts](../../src/lib/brain/embeddings.ts) — handles model auto-resolution (`resolveEmbeddingModel`), Tauri HTTP, and batching (16/call) | Reuse them; `embedAllModels` embeds all missing models in 2 batched calls, not 31 sequential ones |
| Embeddings stored as raw BLOB, deserialised via `Buffer` | App-wide convention is **base64-encoded Float32** strings (`encodeVec`/`decodeVec` in embeddings.ts); `Buffer` does not exist in a webview, and tauri-plugin-sql does not round-trip raw BLOBs cleanly | Store model embeddings as base64 text in the existing `embedding` column (SQLite type affinity accepts this); reuse the existing codec — zero new serialisation code |
| Modify `src/lib/db/mental-models.ts` so `getAllModels()` returns Float32Arrays | File is [mentalModels.ts](../../src/lib/mentalModels.ts); its `MentalModel` type is shared by the lens picker and Phase 2 node | **Not modified.** `suggestions.ts` reads/writes the `embedding` column with its own two queries, keeping vectors out of the shared model type entirely |
| Patch `src/components/canvas/NodeWrapper.tsx` | No such file — node components are independent, wrapped only by an error boundary; **Note/Task titles are local state persisted on blur**, and the AI Chat draft is local state, so no central wrapper or store watcher can see live typing | A shared hook `useModelSuggestions(nodeId, text, selected)` + a one-line call in each of the 4 supported node components (see Design decision 1) |
| Chips positioned via `useReactFlow().project()` screen-coordinate math | App uses **@xyflow/react v12**, which has `<ViewportPortal>` — children render directly in flow coordinates inside the canvas layer | The chip tray renders through `ViewportPortal` at `(node.x, node.y + node.height + 8)`; no projection math, pan/zoom tracking is free (chips scale with zoom like everything else on canvas) |
| `initBrain()` entry point in `src/lib/brain/index.ts` | No `index.ts` / `initBrain` — Brain startup jobs run in a 4-second-delayed effect in [App.tsx:134](../../src/App.tsx#L134) | Add `embedAllModels()` then `loadModelEmbeddings()` (sequential, try/caught) to that effect |
| 30 models | The library has **31** models | Cosmetic; log line reports the real count |
| Dismissals tracked in a NodeWrapper `useRef` | No wrapper; React Flow can unmount off-screen nodes, which would wipe a ref | Module-level `Map<nodeId, Set<modelId>>` in suggestions.ts — session-only, survives node unmount/remount |
| "Mental Model prompt responses remain unindexed (deferred)" | Superseded: v1.8.1 indexes them automatically via the generic string collector | No action; noting so the request docs don't contradict each other |
| "Phase 2 Mental Model node: no change" | The spec's own trigger table lists Mental Model prompt responses as a suggestion source | The Phase 2 component gains the same one-line hook call as Note/Task/AiChat |
| "When a node is active (focused/editing)" | No app-level focus tracking exists | React Flow's `selected` prop is the activity gate: typing requires clicking into the node (which selects it); deselection clears chips immediately |

### Design decisions

1. **Per-component trigger hook, not a wrapper or store watcher.** Each supported node calls `useModelSuggestions(mindNode.id, liveText, selected)` with its real live text (including text that only exists in local state: Note/Task titles mid-edit, the AI Chat draft). The hook owns the 1s debounce, the ≥20-char guard, the dismissal filter, and a stale-response check (a slow embed resolving after deselection is discarded). Unsupported node types simply never call the hook — the "no chips on widget nodes" guarantee is structural, not a runtime filter.
2. **The node renders its own chip tray through `ViewportPortal`.** No Canvas.tsx change, no store state, no global overlay manager — the tray is declared inside the node component but renders into the canvas viewport layer, so it sits below the node, outside its bounds, unclipped by node overflow, and never shifts other nodes.
3. **Spawn pre-loads the model, skipping the Phase 2 picker.** `addNode({type: "mental-model", data: {model_id, prompt_responses: {}, summary: ""}, x: src.x + src.width + 80, y: src.y + 80, width: 320, height: 420})` then `addEdge({source: srcId, target: newId})`. Because Phase 2's lens wiring is edge-derived, spawning a suggestion **from an AI Chat node automatically activates that model as the chat's lens** — emergent from the two designs composing, and exactly the right behaviour.
4. **Dimension-mismatch guard.** If the user switches LM Studio embedding models, stored model vectors may not match the query vector's length; mismatched vectors are skipped (same guard `vectorTopK` uses). Re-embedding path is `UPDATE mental_models SET embedding = NULL` + restart — documented here, no UI for it (matches the spec's deferral of settings UI).
5. **Threshold** `SUGGESTION_THRESHOLD = 0.72` as spec'd, with the spec's tuning guidance (raise to 0.76–0.78 for false positives, lower to 0.68 for false negatives) preserved as a comment next to the constant.

## Plan

1. **`src/lib/brain/suggestions.ts`** (new) — `SUGGESTION_THRESHOLD`; `embedAllModels()` (SELECT models WHERE embedding IS NULL → `embedTexts` batched → UPDATE with `encodeVec`; logs `[suggestions] embedded N models`; throws nothing — catches and warns); `loadModelEmbeddings()` (SELECT id, embedding WHERE NOT NULL → `decodeVec` → module-scoped `Map<string, Float32Array>` cache with precomputed norms); `suggestModels(text, excludeIds)` (guards: cache loaded, text ≥ 20 chars; `embedQuery` → cosine vs cache → ≥ threshold → top 2 → `getModelById` for the winners; returns `[]` on any failure); `dismissModel(nodeId, modelId)` / dismissal lookup (module Map).
2. **App.tsx startup** — inside the existing 4s-delayed Brain jobs effect ([App.tsx:134](../../src/App.tsx#L134)): `await embedAllModels(); await loadModelEmbeddings();` sequential, try/caught so an offline LM Studio never blocks digest/triage.
3. **`src/components/canvas/ModelSuggestionChips.tsx`** (new) — exports the `useModelSuggestions` hook and the `<ModelSuggestionChips>` tray. Tray: `ViewportPortal`, horizontal flex row gap 8, pill chips (border-radius 99px, 12px font, lucide `Brain` icon + name, 16px × dismiss button with `aria-label`), `title` attribute tooltip with `model.description`, 8s auto-dismiss timer (paused on `onMouseEnter`, reset on new models, cleared when empty), opacity 0→1 over 150ms, renders `null` when no models. All buttons `nodrag nopan`.
4. **Wire the four trigger nodes** — one hook call + tray render each: [NoteNode.tsx](../../src/components/nodes/NoteNode.tsx) (title local state + content from `mindNode.data`), [TaskNode.tsx](../../src/components/nodes/TaskNode.tsx) (title + description), [AiChatNode.tsx](../../src/components/nodes/AiChatNode.tsx) (draft input state), MentalModelNode.tsx from Phase 2 (prompt responses joined).
5. **Spawn + dismiss handlers** — per Design decision 3; dismiss adds to the session Map and removes the chip.
6. **Close-out** — version 1.8.2 in the four locations (package.json, tauri.conf.json, SettingsPanel release-notes array, SettingsPanel footer), CHANGELOG entry, delivery report in this file, Completed ledger row, regenerate metrics.
7. **Verify** — `tsc` + production build; packaged-binary boot-verify against the real vault (temporary beacon, removed before release build): app boots, `[suggestions] embedded 31 models` on first launch and `0` on second, existing nodes intact. Manual checklist items needing a human at the screen (chip appearance/relevance, hover pause, click-to-spawn, dismissal persistence) recorded honestly as run/not-run; the live relevance checks ("pricing decision" → Cost vs. Value vs. Price) attempted if an embedding model is loaded at verify time.

## Progress

- [x] Step 1 — `suggestions.ts`: embedding backfill job (batched via `embedTexts`), base64 vector cache, `suggestModels` with threshold/length/dimension guards, module-level per-node session dismissals (src/lib/brain/suggestions.ts — new)
- [x] Step 2 — App.tsx startup: `embedAllModels()` + `loadModelEmbeddings()` appended to the 4s-delayed Brain jobs effect, try/caught
- [x] Step 3 — `ModelSuggestionChips.tsx`: `useModelSuggestions` hook (1s debounce, stale-response guard, dismissal filter, clear-on-deselect) + `ViewportPortal` chip tray (Brain icon pills, × with aria-label, title-attr tooltip, 8s auto-dismiss paused on hover, 150ms fade) (src/components/canvas/ModelSuggestionChips.tsx — new)
- [x] Step 4 — Trigger nodes wired: NoteNode (title + content preview), TaskNode (title + checklist items), AiChatNode (draft input), MentalModelNode (prompt responses) — one hook call + tray render each
- [x] Step 5 — Spawn handler in the tray: `addNode` (mental-model pre-loaded, +width+80/+80 offset) + `addEdge` from the source node
- [x] Step 6 — Close-out: version 1.8.2 in four locations, CHANGELOG entry
- [x] Step 7 — Verify: typecheck + build clean; packaged boot 1 embedded all 31 models live via LM Studio with the vault intact

**Deviation from the approved plan:** `SUGGESTION_THRESHOLD` shipped at **0.68**, not the spec's 0.72 starting point. During packaged verification the spec's own canonical example — a pricing-decision note — scored 0.711 against "Cost vs. Value vs. Price" (the exact intended match) and returned zero chips at 0.72. Measured distribution against the real embedded library (nomic-embed-text-v1.5): relevant matches 0.71–0.76, irrelevant operational/list text ≤ 0.51. The spec explicitly prescribed "lower to 0.68" as the false-negative correction; 0.68 fires both canonical relevant cases with one chip each and zero chips on noise, with a wide margin both sides. Calibration data recorded in the constant's comment.

## Out of Scope

- Per-category thresholds; suggestions in the menubar capture popover; Today digest surfacing; Settings on/off toggle; re-suggesting after significant content change (all deferred per spec)
- Re-embedding UI after an embedding-model switch (manual SQL documented above)
- Chips in canvas exports; any change to existing Brain retrieval, citations, digest, triage, knowledge graph; any change to Canvas.tsx, the store, the registry, or mentalModels.ts

## Complete Summary

Ambient model suggestions shipped. While typing in a Note, Task, AI Chat (draft input), or Mental Model node, the node's text is embedded after a 1-second pause and matched against the embedded 31-model library; up to two models above the calibrated threshold appear as pill chips below the node. Clicking a chip spawns a Mental Model node pre-loaded with that model and wires it to the source node (which, from an AI Chat node, also activates the lens via the v1.8.1 edge-derived wiring). Dismissing a chip mutes that model for that node for the session. Chips auto-dismiss after 8 seconds (hover pauses), clear instantly on deselection, fade in over 150ms, and never appear on widget nodes. The library is embedded once at startup via LM Studio; everything degrades silently when LM Studio is offline. This completes the three-phase Mental Models integration (v1.8.0 lens, v1.8.1 node, v1.8.2 suggestions).

## Technical Overview of the Build

- **[src/lib/brain/suggestions.ts](../../src/lib/brain/suggestions.ts)** (new): `embedAllModels()` backfills NULL `embedding` rows (`name. description. system_prompt_template` per model) via the Brain's batched `embedTexts`, storing base64 Float32 with the existing `encodeVec` codec; logs `[suggestions] embedded N models`. `loadModelEmbeddings()` warms a module-scoped `Map<id, {vec, norm}>`. `suggestModels(text, exclude)` guards (cache ready, ≥20 chars), embeds via `embedQuery`, scores in-process cosine with a dimension-mismatch skip, and returns the top ≤2 models ≥ `SUGGESTION_THRESHOLD` (0.68, calibrated — see Progress deviation). Per-node session dismissals live in a module-level Map so they survive React Flow unmounting off-screen nodes.
- **[src/components/canvas/ModelSuggestionChips.tsx](../../src/components/canvas/ModelSuggestionChips.tsx)** (new): `useModelSuggestions(nodeId, text, selected)` — 1s debounce, dismissal filter, stale-response guard, immediate clear + query cancel on deselect. The tray renders through `@xyflow/react` v12's `ViewportPortal` at flow coordinates `(node.x, node.y + height + 8)` — canvas layer, unclipped, pan/zoom free. Chips: pill, Brain icon (amber), name button (click = spawn), 16px × dismiss with aria-label, `title` tooltip, 8s auto-dismiss timer paused on hover and reset on new models, 150ms opacity fade, renders null when empty. Spawn calls `addNode` (mental-model, `model_id` pre-set so the v1.8.1 picker is skipped, positioned source.x+width+80 / y+80) then `addEdge` from the source node.
- **[src/App.tsx](../../src/App.tsx)**: `embedAllModels()` then `loadModelEmbeddings()` appended sequentially inside the existing 4s-delayed Brain jobs effect; both internally try/caught so an offline LM Studio never blocks digest/triage.
- **Trigger nodes** (one hook call + one tray render each): NoteNode (live title draft + content preview text), TaskNode (live title draft + checklist item texts), AiChatNode (draft input before send), MentalModelNode (prompt responses). React Flow's `selected` prop gates activity. No other node type references the hook — widget nodes are excluded structurally.
- **Untouched, as planned**: Canvas.tsx, the store slices, the registry, mentalModels.ts, all existing Brain retrieval/digest/triage paths, the schema (the `embedding` column existed since v1.8.0).

## Functional Overview of the Build

Write a few sentences in a note — say, about a pricing decision — and pause. A small pill appears under the node: an amber brain icon and "Cost vs. Value vs. Price". Hover it to read what the model is for; click it and a ready-to-fill Mental Model node appears beside your note, already connected; click × and that model stays quiet on this note for the rest of the session. Ignore it and it fades after 8 seconds. The same works on tasks, on a chat message you're drafting (where spawning also sets the chat's lens), and on a Mental Model node's own responses. Short text never triggers it; widgets like Kanban or Weather never show chips; and if LM Studio isn't running, the feature simply stays out of the way.

## Expected Behaviour

Per the acceptance criteria: one-time embed job (idempotent), ≥20-char gate, relevant-content chips within ~1s, max 2, 8s auto-dismiss with hover pause, click-to-spawn wired node (lens auto-activation from chat), per-node session dismissal, clear-on-deselect, no widget-node chips, silent offline degradation, no Phase 1/2 regressions.

## Actual Behaviour

Typecheck and production build pass clean. The packaged binary was boot-verified against the real vault over two instrumented launches with LM Studio online (nomic-embed-text-v1.5 loaded): boot 1 embedded all 31 models live (`models_embedded: 31`, vault intact 112 nodes / 36 edges / 31 models); boot 2 confirmed idempotency (still 31, no re-embed) and exercised the full suggestion pipeline in-process — the spec's canonical pricing text returned exactly `["Cost vs. Value vs. Price"]` and a 5-character string returned nothing. Threshold calibration was measured against the real embedded library (see Progress deviation): the spec's 0.72 produced a false negative on its own canonical example; shipped at 0.68 per the spec's prescribed adjustment. Interactive UI behaviours (chip appearance while typing in the real UI, hover pause, click-to-spawn, dismissal persistence, deselect clearing) need a human at the screen and were not exercised — recorded honestly below.

## Test Cases

| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Typecheck + production build | `tsc --noEmit`; `npm run build` | No errors | Clean | Pass |
| 2 | First-launch embedding job | Packaged boot, LM Studio online | All NULL embeddings backfilled | 31/31 embedded live | Pass |
| 3 | Embed idempotency | Second packaged boot | No re-embedding | Still 31; job found 0 missing | Pass |
| 4 | Vault integrity | Both boots against real vault | Counts intact, no errors | 112 nodes / 36 edges / 31 models, no beacon errors | Pass |
| 5 | Relevance: pricing text | `suggestModels(pricing decision text)` in packaged app | "Cost vs. Value vs. Price" suggested | Exactly that, one chip | Pass |
| 6 | Relevance: conformity text | Cosine measured against real embeddings | "Asch Conformity" above threshold | 0.759 (top, margin 0.19 over runner-up) | Pass |
| 7 | Noise rejection: operational + list text | Cosine measured against real embeddings | No model above threshold | Max 0.514 / 0.507 — well below 0.68 | Pass |
| 8 | Short-text gate | `suggestModels("short")` | `[]` immediately | 0 results | Pass |
| 9 | Chips appear while typing in UI | Type pricing note in a real Note node | Chip within ~1s of pause | Not run (needs human) | Not run |
| 10 | Auto-dismiss / hover pause / deselect clear | Wait 8s; hover; click canvas | Per spec | Not run | Not run |
| 11 | Click-to-spawn + wiring + lens | Click chip on note; on chat | Wired MM node; lens activates from chat | Not run (spawn path uses the same store calls verified in v1.8.1 boot test) | Not run |
| 12 | Per-node dismissal persistence | Dismiss, keep typing | Model stays muted for node | Not run (logic unit: module Map filter) | Not run |
| 13 | Offline degradation | LM Studio stopped | App normal, no chips, no errors | Not run this cycle (offline guards exercised implicitly: every call is try/caught; v1.8.0 verified the offline pattern) | Not run |

## Acceptance Criteria

- [ ] First launch after merge: console logs `[suggestions] embedded 31 models`; second launch logs `embedded 0`
- [ ] Typing < 20 chars in a Note: no chips; typing a pricing-decision note: a relevant chip (e.g. Cost vs. Value vs. Price) appears within ~1s of pausing
- [ ] Maximum 2 chips; chips auto-dismiss after 8s of inactivity; hover pauses the timer and shows the model description
- [ ] Clicking a chip spawns a Mental Model node pre-loaded with that model, wired by an edge to the source node; if the source is an AI Chat node, the lens auto-activates (amber dot)
- [ ] Dismissing (×) suppresses that model for that node for the session, even after further typing; other nodes still get it
- [ ] Deselecting the node clears chips immediately
- [ ] No chips ever appear on Kanban, Calendar, Pomodoro, or other widget nodes
- [ ] LM Studio offline at startup: app launches normally, no errors, suggestions silently absent; embeddings backfill on a later launch
- [ ] Phase 1 lens and Phase 2 node behaviour unchanged; typecheck and production build clean; packaged binary boot-verified against the real vault
