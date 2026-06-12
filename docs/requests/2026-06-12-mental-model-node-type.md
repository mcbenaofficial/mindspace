# Mental Model Node Type (Phase 2 of Mental Models Integration)

- **Status:** 🟢 Complete
- **Approved:** 2026-06-12 ("go for it" — both v1.8.1 and v1.8.2 approved together, built in order)
- **Date raised:** 2026-06-12
- **Requested by:** mcbenaofficial (request doc provided inline, status PENDING APPROVAL)
- **Release version:** v1.8.1
- **Depends on:** v1.8.0 Mental Model Chat Lens (shipped 2026-06-12)

## Requested Feature

Add a new canvas node type — the **Mental Model node** — under a "Think" category in the node spawn menu. Dropping one on the canvas opens a model picker (the 31-model library from v1.8.0); selecting a model renders a structured node:

- **Header**: model name, category badge, a swap button (changes model after a confirmation; clears responses), standard node controls.
- **Prompt fields**: one labelled textarea per guided question in the model's `prompts` array; responses persist to node data on blur.
- **Summary**: a TipTap rich-text field (bold / italic / bullet list) with placeholder "Distil your conclusion here.", plus a **"Summarise with AI"** button (visible once any prompt response is non-empty) that sends the filled responses to LM Studio and streams a one-paragraph synthesis into the field (max 300 tokens).

**Wiring**: connecting a Mental Model node to an AI Chat node automatically activates that model as the chat's lens (amber dot shows); deleting the edge clears the lens. Edges to any other node type draw normally with no special behaviour.

**Spawn-abort**: Escape on the initial picker (no model chosen) removes the node from the canvas.

Phase 3 (Brain ambient suggestions, v1.8.2) depends on this node type existing as the spawn target for suggestion chips.

## Clarifications (Q&A)

No user-blocking questions this round — the spec's open points ("confirm before building") were all resolvable from the codebase. Resolutions below; flag any you disagree with before approving.

### Codebase-reality adaptations (spec assumed structure that differs from the real code)

| Spec assumption | Reality | Adaptation |
|---|---|---|
| Node type id `mentalModel` | All node ids are kebab-case (`ai-chat`, `sticky-note`) | Type id is **`mental-model`** |
| Category "Think" exists | Categories are `create / plan / time / data / connect` ("More") — no Think | **Add a new `think` category** to `NodeCategory` + `CATEGORIES` in [registry.tsx](../../src/components/nodes/registry.tsx); the NodePicker tab row derives from it automatically |
| Registry entry has `defaultData: {...}` object | `defaultData` is a **function** returning fresh data | `defaultData: () => ({ model_id: null, prompt_responses: {}, summary: "" })` |
| Components receive `data.model_id` directly; update via `updateNodeData(...)` | Components receive `data.mindNode` (a `MindNode`); persist via `updateNode(mindNode.id, { data: {...} })`, delete via `deleteNode(mindNode.id)` (Zustand store) | Use the real store API throughout |
| Edge logic lives in `src/lib/canvas/edges.ts` | No such file. `handleConnect`/`handleEdgesDelete` live in `Canvas.tsx`; edges are store state (`useStore().edges`) persisted to the `edges` table | **No Canvas.tsx change at all** — AiChatNode derives the wired lens from store edges (see Design decision 1) |
| `src/lib/db/mental-models.ts`, `migrations/004_mental_models.sql` | Phase 1 shipped these as `src/lib/mentalModels.ts` and inline migrations in `db.ts` | Reused as-is, zero changes |
| One-shot AI call via `src/lib/ai/chat.ts` | The utility is `streamChatCompletion` in [aiStream.ts](../../src/lib/aiStream.ts) (used by AiChatNode with `settings.lmstudio_url` / `lmstudio_model`) | Reuse it for "Summarise with AI" (streaming into the editor comes free) |
| Summary stored as HTML | Note content is stored as **TipTap JSON string** (`NoteData.content`), and search extraction (`tiptapText`) understands that format | Store summary as TipTap JSON for consistency and clean search indexing |
| "Prompt responses are not indexed by FTS5 in this phase" | The search indexer (`extractSearchText`) generically collects **all** string fields from node data — responses get indexed automatically with zero code | Accept the free indexing (it is strictly beneficial); add one line so the summary's TipTap JSON is converted to plain text instead of being indexed as raw JSON |
| Picker spawn-abort "consistent with other nodes that require initial configuration" | No existing node opens a picker on spawn — this is a **new pattern** | Implement as described; any dismissal without a selection (Escape *or* outside click) deletes the node, since it is unusable without a model |
| Summary gets a "minimal inline bubble menu" | No bubble menu exists anywhere in the app; the Note editor uses a small fixed toolbar button row | A 3-button mini toolbar (Bold / Italic / List, lucide icons) above the summary field — consistent with the app's existing editor idiom |
| Confirmation dialog on model swap | No native-dialog pattern in the app | Inline confirm popover inside the node ("Changing the model will clear your responses." + Continue / Cancel buttons) |

### Design decisions

1. **Lens wiring is edge-derived, not handler-injected.** The spec asks to patch the canvas `onConnect`/edge-delete handlers and notes that AiChatNode's `activeLens` (session-only local state from Phase 1) may need lifting into persisted node data. Instead, AiChatNode gets a `useEffect` that watches store `edges` + `nodes`: when an edge connects it to a `mental-model` node (either direction) whose `model_id` is set, it fetches the model and calls `setActiveLens(model)`; when that wiring disappears, it clears the lens. Consequences, all desirable:
   - **No lifting** — manual lens stays session-only exactly as Phase 1 specified; nothing new is persisted on the chat node.
   - **Wired lens survives restarts** for free, because the *edge* is already persisted — reopening a canvas with the wiring intact re-activates the lens.
   - Edge deletion through *any* path (edge × button, node deletion cascade, undo) clears the lens automatically — no second handler to keep in sync.
   - The manual pill still works: picking a lens by hand overrides the wired one until the wiring changes; the × clears it. The pill and amber dot show whichever lens is effective.
2. **Either-direction wiring.** The spec says Mental Model → Chat; users draw edges both ways, and direction carries no meaning elsewhere in MindSpace, so a chat node connected to a model node in either direction activates the lens. (Minor, forgiving deviation.)
3. **If a chat node is wired to multiple mental-model nodes**, the most recently added edge wins (deterministic: last matching edge in store order). Not in spec; documented for completeness.
4. **`prompt_responses` is keyed by string index** (`Record<string, string>`) as in the spec's JSON example. If a model's prompts ever change in a future seed update, stale keys are simply ignored at render.

## Plan

1. **Types** — [src/types/index.ts](../../src/types/index.ts): add `"mental-model"` to `NodeType`; add `MentalModelData { model_id: string | null; prompt_responses: Record<string, string>; summary: string }`; add to the `NodeData` union.
2. **Confirm LensPicker reuse** — done during investigation: `LensPicker` (props `value / onChange / onClose`) has no internal "clear" option (clearing is external via the pill ×), so it is reusable **verbatim** as the model picker. Zero changes to [LensPicker.tsx](../../src/components/LensPicker.tsx).
3. **MentalModelNode component** — new file `src/components/nodes/MentalModelNode.tsx`:
   - Receives `{ mindNode }`; loads the model via `getModelById(data.model_id)` (skeleton row while loading; "model missing" fallback if the id no longer exists in the library).
   - `model_id === null` on mount → render LensPicker immediately; select → `updateNode(id, { data: { ...d, model_id } })`; dismiss without selection → `deleteNode(id)`.
   - Header: model name (14px), short category badge (Management / Career / Thinking, muted pill), swap button (lucide `ArrowLeftRight`) opening the picker behind an inline confirm when responses exist, delete ×. `NodeResizer` on cmd-hold like other nodes.
   - Prompt fields: textareas (min 2 rows, vertical resize) labelled by each `model.prompts[i]`; local state mirrors `data.prompt_responses`, persisted on blur via `updateNode`. All interactive children get `nodrag nopan` (+ `nowheel` on scrollable body), matching existing nodes.
   - Summary: TipTap (`StarterKit` + `Placeholder.configure({ placeholder: "Distil your conclusion here." })` — same stack as the Note editor), mini toolbar (Bold / Italic / List), persisted as TipTap JSON on blur.
   - "Summarise with AI": visible when any response is non-empty; builds the spec's Q/A prompt, calls `streamChatCompletion` against `settings.lmstudio_url` + `/v1/chat/completions` with `settings.lmstudio_model`, `max_tokens: 300`; streams deltas into the editor as plain paragraph text; on completion persists the summary; spinner + disabled state while running; error shown inline (LM Studio offline degrades gracefully, consistent with v1.5.0 conventions).
4. **Registry** — [registry.tsx](../../src/components/nodes/registry.tsx): add `"think"` to `NodeCategory`, `{ id: "think", label: "Think" }` to `CATEGORIES`, and the `mental-model` entry (icon `Brain`, `defaultSize { width: 320, height: 420 }`, defaultData per above). NodePicker, canvas, and editor all derive from the registry — no other registration code.
5. **AiChatNode wiring** — [AiChatNode.tsx](../../src/components/nodes/AiChatNode.tsx): add the edge-derived lens effect (Design decision 1). ~25 lines; no change to Phase 1 manual-lens behaviour, injection order, or persistence.
6. **Search extraction** — [search.ts](../../src/lib/search.ts): include `"mental-model"` summary in the TipTap-JSON→text conversion branch so the index gets clean text (one conditional).
7. **Close-out** — version bump to 1.8.1 in the four locations (package.json, tauri.conf.json, SettingsPanel release-notes array, SettingsPanel footer), CHANGELOG entry, request-doc delivery report, Completed ledger row, regenerate metrics.
8. **Verify** — `tsc` + production build; packaged-binary boot-verify against the real vault per the standing rule (temporary beacon, removed before release build): app boots, existing nodes intact, a programmatically-inserted mental-model node renders after restart. Manual UI checklist items that need a human at the screen (picker interactions, streaming summary, wiring dot) recorded honestly as run/not-run in the test table; the live LM Studio one-shot will be attempted if a model is loaded at verify time.

## Out of Scope

- Phase 3: Brain ambient suggestions, suggestion chips, embedding of model content (v1.8.2)
- Mental Model node in the Today digest; formatted summary export; multiple models per node
- Special behaviour for edges to Task / Note / other node types (they draw normally; Phase 3 indexes the relationship)
- Any change to existing node types beyond the AiChatNode lens effect; no change to undo/redo, automations, or the rules engine
- NodeEditorModal full-screen editor support for the mental-model type (the node body is the editor; the modal shows nothing extra this phase)

## Progress

- [x] Step 1 — Types: `"mental-model"` added to `NodeType`, `MentalModelData` interface added and joined to the `NodeData` union (src/types/index.ts)
- [x] Step 2 — LensPicker reuse confirmed verbatim; zero changes (src/components/LensPicker.tsx untouched)
- [x] Step 3 — MentalModelNode component: picker-on-spawn (dismiss without selection deletes the node), header with name + category badge + swap-behind-inline-confirm + delete, prompt textareas persisted on blur, TipTap summary (StarterKit + Placeholder, 3-button Bold/Italic/List toolbar) persisted as TipTap JSON on blur, "Summarise with AI" streaming via `streamChatCompletion` with max_tokens 300 and a Stop control, inline error display (src/components/nodes/MentalModelNode.tsx — new)
- [x] Step 4 — Registry: `think` category added to `NodeCategory` + `CATEGORIES`; `mental-model` entry with `Brain` icon, 320×420 default, defaultData factory (src/components/nodes/registry.tsx)
- [x] Step 5 — AiChatNode edge-derived lens effect: `useMemo` over store edges+nodes finds the wired mental-model (either direction, last edge wins), effect applies/clears the lens; removal clears only the lens the wiring set, preserving a manual override (src/components/nodes/AiChatNode.tsx)
- [x] Step 6 — Search extraction: mental-model `summary` converted from TipTap JSON to text before indexing (src/lib/search.ts)
- [x] Step 7 — Close-out: version 1.8.1 in package.json, tauri.conf.json, SettingsPanel release-notes array + footer; CHANGELOG entry
- [x] Step 8 — Verify: typecheck + production build clean; packaged binary boot-verified against the real vault (two instrumented boots — insert, restart, render check, cleanup); beacon removed and clean release binary rebuilt

## Complete Summary

The Mental Model node shipped as designed. A new **Think** tab in the node spawn menu offers "Mental Model"; dropping one opens the v1.8.0 model picker immediately, and dismissing it without a selection removes the node. With a model chosen, the node shows the model name and category badge in the header, one textarea per guided prompt (persisted to the vault on blur), and a rich-text Summary field with a Bold/Italic/List toolbar and a "Summarise with AI" button that streams a one-paragraph synthesis from LM Studio. The model can be swapped from the header behind an inline confirmation that warns responses will be cleared. Wiring a Mental Model node to an AI Chat node activates that model as the chat's lens (amber dot); removing the wire clears it; because the edge is persisted, the wired lens survives app restarts.

## Technical Overview of the Build

- **Types** ([src/types/index.ts](../../src/types/index.ts)): `"mental-model"` added to `NodeType`; new `MentalModelData { model_id: string | null; prompt_responses: Record<string, string>; summary: string }` joined to the `NodeData` union. Summary is stored as a TipTap JSON string, matching `NoteData.content`.
- **Component** ([src/components/nodes/MentalModelNode.tsx](../../src/components/nodes/MentalModelNode.tsx), new, ~390 lines): standard `ms-node` shell (accent bar, header, cmd-hold `NodeResizer`, 4 handles, framer-motion entrance). When `model_id` is null it renders only the LensPicker; `onClose` (Escape or outside click) calls `deleteNode`. Model loading via `getModelById` with a "model missing" fallback. Prompt responses mirror to local state and persist on blur through `updateNode` with a latest-data ref to avoid stale spreads. The summary editor is TipTap StarterKit + Placeholder ("Distil your conclusion here."), persisted on editor blur; external changes (e.g. swap clearing it) sync into the editor unless a stream is writing. "Summarise with AI" builds a Q/A prompt from non-empty responses and calls `streamChatCompletion` (`settings.lmstudio_url`, `settings.lmstudio_model`, `max_tokens: 300`), streaming deltas into the editor and persisting on completion; the button becomes Stop mid-stream; errors render inline.
- **Registry** ([src/components/nodes/registry.tsx](../../src/components/nodes/registry.tsx)): `think` added to `NodeCategory` and `CATEGORIES`; `mental-model` entry (icon `Brain`, 320×420, defaultData factory). NodePicker, canvas, and editor derive from the registry — no other registration.
- **Lens wiring** ([src/components/nodes/AiChatNode.tsx](../../src/components/nodes/AiChatNode.tsx), ~35 lines): a `useMemo` over store `edges`+`nodes` resolves the wired mental-model id (either edge direction; multiple wires → last edge wins); an effect applies it via `getModelById` → `setActiveLens`, and on wiring removal clears the lens only if the wiring set it — a manual pick is preserved. No Canvas.tsx change; no persistence change to the chat node.
- **Search** ([src/lib/search.ts](../../src/lib/search.ts)): mental-model `summary` converted from TipTap JSON to plain text before indexing; prompt responses index automatically via the generic string collector.
- **Versioning**: 1.8.1 in package.json, tauri.conf.json, SettingsPanel release-notes array, SettingsPanel footer; CHANGELOG entry added.

## Functional Overview of the Build

Open the node menu, switch to the new **Think** tab, and drop a Mental Model node. Pick a framework from the searchable picker (Escape or clicking elsewhere cancels and removes the empty node). Answer the guided questions at your own pace — everything saves as you go. Use the Summary field to write your conclusion with bold/italic/bullet formatting, or press "Summarise with AI" (appears once you've answered at least one question) to have your local model draft it; press Stop to interrupt. Use the swap button (double-arrow) to change frameworks — you'll be warned that responses clear. Draw an edge from the node to any AI Chat node and that chat immediately reasons through your chosen framework (amber dot on the chat header); delete the edge to return the chat to normal. Reopen the app and both your responses and the wired lens are back.

## Expected Behaviour

Per the acceptance criteria: Think tab with Brain icon; picker on spawn with dismissal-removes-node; prompt fields render per model and persist; summary formats and persists; Summarise with AI hidden until a response exists, streams when LM Studio is online; swap behind inline confirm clearing responses; wiring activates/clears the lens and survives restart; Phase 1 behaviour unchanged; existing nodes, search, undo/redo unaffected.

## Actual Behaviour

Typecheck and production build pass clean. The packaged 1.8.1 binary was boot-verified against the real vault with a temporary beacon over two launches: boot 1 found the vault intact (112 nodes, 36 edges, 31 mental models) and programmatically inserted a mental-model node (model: Asch Conformity, one prompt response) on the active canvas via the real store path; boot 2 found the node persisted (113 nodes), confirmed the component **rendered with its model name visible in the live DOM** (no error-boundary card), and deleted the test node, returning the vault to its prior state. The beacon was then removed and the clean release binary rebuilt. Interactive UI flows (picker keyboard navigation, typing/blur in the real UI, summary formatting buttons, live AI streaming, swap confirmation, amber-dot wiring) require a human at the screen and were not exercised — recorded honestly below. No LM Studio chat model was exercised during verification.

## Test Cases

| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Typecheck + production build | `tsc --noEmit`; `npm run build` | No errors | Clean (one unused-import warning fixed during build) | Pass |
| 2 | Packaged boot, vault integrity | Launch packaged 1.8.1 against real vault | App boots; counts intact | 112 nodes / 36 edges / 31 models reported by beacon | Pass |
| 3 | Mental-model node persists + renders after restart | Beacon inserts node boot 1; relaunch | Node present in DB and store; component renders | 113 nodes; `rendered: true` (model name in DOM); cleaned up | Pass |
| 4 | DB round-trip of node data | Insert with `model_id` + `prompt_responses` via store | Data survives restart | Survived; store loaded it on boot 2 | Pass |
| 5 | Think tab + picker on spawn | Open node menu → Think → drop node | Picker opens; Escape/outside-click removes node | Not run (needs human) | Not run |
| 6 | Prompt fields persist on blur | Type in a field, blur, pan/zoom, restart | Content retained | Not run via UI (DB path verified in #3/#4) | Not run |
| 7 | Summary formatting + persistence | Bold/italic/bullets, blur, restart | Formatting retained | Not run | Not run |
| 8 | Summarise with AI | ≥1 response, press button (LM Studio online) | Streams ≤300-token paragraph; Stop works | Not run (no chat model exercised) | Not run |
| 9 | Swap with confirmation | Swap with responses present | Inline confirm; Continue clears, Cancel keeps | Not run | Not run |
| 10 | Wiring activates/clears lens | Edge MM↔Chat; delete edge; restart with edge | Amber dot on wire; clears on delete; re-activates after restart | Not run | Not run |
| 11 | Existing node types / search regression | Boot against real vault | No errors, index intact | No beacon errors; all 8 active-canvas nodes loaded | Pass |

## Acceptance Criteria

- [ ] "Mental Model" appears in a new **Think** tab of the node spawn menu with the Brain icon
- [ ] Dropping the node opens the model picker immediately; Escape or outside-click without a selection removes the node
- [ ] Selecting Inversion renders its guided prompt fields with the correct questions
- [ ] Typing in a field and blurring persists; pan/zoom does not lose content; close + reopen the app restores responses and summary from the DB
- [ ] Summary field accepts bold / italic / bullet formatting and persists
- [ ] "Summarise with AI" is hidden when all fields are empty, visible once any field has content, and streams a synthesis into the summary field (LM Studio online)
- [ ] Swap button shows an inline confirmation; confirming changes the model and clears responses + summary; cancelling changes nothing
- [ ] Wiring a Mental Model node to an AI Chat node activates the lens (amber dot + pill); deleting the edge clears it; the wiring re-activates after an app restart
- [ ] All Phase 1 lens behaviour unchanged (manual pick, clear, session-only, injection order)
- [ ] Existing node types, search, undo/redo unaffected; typecheck and production build clean; packaged binary boot-verified against the real vault
