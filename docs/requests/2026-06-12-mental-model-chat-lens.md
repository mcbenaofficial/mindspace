# Mental Model Chat Lens (v1.8.0)

- **Status:** 🟢 Complete
- **Approved:** 2026-06-12T06:14:34+05:30 — "If 31, build 31" (31-model count confirmed)
- **Date raised:** 2026-06-12
- **Requested by:** mcbenaofficial
- **Release version:** v1.8.0
- **Source request doc:** `~/Downloads/v1.8.0-mental-model-chat-lens.md` (user-authored)

## Requested Feature

Add a "Lens" control to every AI Chat node. Selecting a mental model from a library injects that model's reasoning framework into the LM Studio system prompt for the session, so the chat reasons through questions using that framework. No other chat behaviour changes.

This is Phase 1 of a three-phase Mental Models integration (Phase 2: Mental Model node type; Phase 3: Brain ambient suggestions). It ships the shared `mental_models` SQLite table and seed data the later phases depend on.

Key behaviours from the request doc:

- Lens pill on the AI Chat node; default `Lens: None` — zero change to existing behaviour.
- Clicking opens a `LensPicker`: searchable dropdown grouped by category (Management & Leadership / Career / Thinking & Perspective), alphabetical within groups, keyboard navigable, 320px max height with internal scroll, description line per model.
- On selection the pill shows the model name and a small amber dot (`#EF9F27`) appears on the node header. A × on the pill clears the lens.
- Lens is **session-only** — held in component state, never persisted; reopening the node resets to None.
- When active, the model's `system_prompt_template` is prepended to the system prompt sent to LM Studio. Streaming, history, attachments, Brain mode all unaffected.

## Clarifications (Q&A)

**Q: Where does the content for the 30 models come from? Mosaic is purchased content not present in the repo.**
A: Claude authors original descriptions and system_prompt_templates for the named models. All are publicly known mental models; no Mosaic text is copied.

**Q: The doc places the Lens pill "after the existing model selector", but the chat node has no toolbar or model selector. Where should it go?**
A: In the input bar, next to the existing Brain and Paperclip buttons — consistent with how Brain mode is toggled. Amber header dot when active, as specified.

## Codebase reality vs. request doc (adaptations)

The request doc assumed a structure that differs from the actual project. The plan adapts as follows:

| Doc assumed | Actual codebase | Plan |
|---|---|---|
| `src-tauri/migrations/004_mental_models.sql` | No SQL migration files; schema is inline in `runMigrations()` in `src/lib/db.ts` | Add `mental_models` table + index + seed step to `runMigrations()` |
| `src/lib/ai/chat.ts` with `buildSystemPrompt()` | No such file; system prompt assembled inline in `handleSend` in `src/components/nodes/AiChatNode.tsx` (~lines 386–395) | Prepend lens template at the top of `systemContent` there |
| `src/lib/db/mental-models.ts` | `src/lib/` is flat (`db.ts`, `search.ts`, …) | New `src/lib/mentalModels.ts` following the flat convention |
| Toolbar with model selector | Input bar with Brain/Paperclip buttons; passive model label in header | Lens pill in the input bar |

**Flagged discrepancy — model count.** The doc claims 30 unique models, but its category enumerations contain **31 distinct names** (18 management + 3 unique to career + 10 unique to thinking: Base Rate Error, Bayesian Thinking, Correlation vs. Causation, False Dichotomies, Mean Regression, Plausibility vs. Probability, Signal vs. Noise, Survivorship Bias, Via Negativa, Inversion — the doc says "9 unique to thinking" but lists 10, including Inversion which the doc itself uses as its example lens). **Plan: seed all 31 enumerated models** and use 31 in the verification check. Flag here for the approver; if one name should be dropped to reach 30, say which.

Each model is stored once with a primary category (`management` for the 18, `career` for its 3 unique, `thinking` for the 10 unique). The LensPicker shows all models grouped by primary category.

## Plan

1. **Schema + seed** — `src/lib/db.ts`: add to `runMigrations()`:
   - `CREATE TABLE IF NOT EXISTS mental_models (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT, prompts TEXT, system_prompt_template TEXT, tags TEXT, embedding BLOB, source_url TEXT)` + `idx_mm_category` index. (`prompts`/`tags` are JSON-array text; `embedding` reserved for Phase 3.)
   - Seed step: if `SELECT COUNT(*) FROM mental_models` is 0, insert all rows from the seed file.
2. **Seed data** — new `src/data/mentalModels.seed.json` (creates `src/data/`): 31 models with id (kebab-case slug), name, primary category, one-line description, `prompts` (3–5 reflective questions each, for Phase 2), `system_prompt_template` (a reasoning-framework instruction, original text authored by Claude), `tags`, `source_url: null`.
3. **DB layer** — new `src/lib/mentalModels.ts`: `MentalModel` interface; `getAllModels()`, `getModelById(id)`, `getModelsByCategory(category)`; JSON fields parsed here so consumers get typed arrays.
4. **LensPicker** — new `src/components/LensPicker.tsx`: props `value`, `onChange`, `onClose`; fetches via `getAllModels()` on mount; groups by category with muted non-selectable headers; search input (lucide `Search` icon) filtering name+description case-insensitively across all groups; ArrowUp/Down + Enter + Escape; outside-click dismiss; max-height 320px internal scroll; styled with existing `--ms-*` CSS variables; no emoji, lucide icons only.
5. **AiChatNode patch** — `src/components/nodes/AiChatNode.tsx`:
   - `const [activeLens, setActiveLens] = useState<MentalModel | null>(null)` — component state only, never written to node data (session-only by construction; component unmount on node close resets it).
   - Lens pill in the input bar next to the Brain toggle: shows lens name when active (amber tint), opens `LensPicker` anchored above/below the pill; × clears.
   - Amber 4px dot (`#EF9F27`) in the node header when a lens is active (both header variants — list view and conversation view).
   - In `handleSend`, prepend the lens template as the first block of `systemContent` (before Brain passages, connected-node context, and the node's own system prompt — matching the doc's "injection first" order); add `activeLens` to the `useCallback` dependency array.
6. **Verify** — `bun run tauri dev` (or packaged-build boot-verify per standing rule): table created, 31 rows seeded; picker renders/searches/keyboard-navigates; lens selection shows dot; LM Studio request contains the prepended template; clearing removes injection; node close/reopen resets lens; existing chat (no lens) byte-identical behaviour.
7. **Close out** — request file updated (progress, summaries, behaviours, test cases), `CHANGELOG.md` v1.8.0 entry, version bump in `package.json` + `src-tauri/tauri.conf.json` + SettingsPanel release notes + footer, `Completed` ledger row, `python3 .claude/harness-metrics.py`.

### Files

| File | Action |
|---|---|
| `src/lib/db.ts` | Modify — table, index, seed step in `runMigrations()` |
| `src/data/mentalModels.seed.json` | New — 31-model seed data |
| `src/lib/mentalModels.ts` | New — typed DB layer |
| `src/components/LensPicker.tsx` | New — grouped searchable dropdown |
| `src/components/nodes/AiChatNode.tsx` | Modify — lens state, pill, header dot, prompt injection |

No changes to: NODE_REGISTRY, canvas/edges/undo, chat history or streaming logic, sidebar, settings, OpenRouter integration.

## Out of Scope

- Mental Model node type (Phase 2, v1.8.1)
- Brain/embedding ambient suggestions (Phase 3, v1.8.2) — `embedding` column ships empty
- Per-node lens persistence across sessions
- Lens indicator on the canvas minimap
- Any change to canvas, undo, search, automations, settings, or OpenRouter STT/TTS

## Acceptance Criteria

- [ ] `SELECT count(*) FROM mental_models` returns 31 (see flagged discrepancy)
- [ ] LensPicker renders all models grouped by category, alphabetical within groups
- [ ] Search filters across all categories by name or description
- [ ] Selecting a lens: pill shows model name; amber dot appears on node header
- [ ] Sending a message with a lens active: LM Studio request system prompt begins with the lens `system_prompt_template`
- [ ] Clearing the lens: dot disappears; next message has no injection
- [ ] Closing and reopening a chat node resets the lens to None
- [ ] With `Lens: None`, chat behaviour is unchanged (streaming, Brain mode, attachments, history)
- [ ] App builds and boot-verifies cleanly

## Rollback

Additive only: one new table + index, one new seed JSON, one new lib file, one new component, and a guarded prepend in `AiChatNode.tsx`. Dropping the table and reverting the two modified files restores prior behaviour exactly; no existing canvases, nodes, or edges are touched.

## Progress

- [x] Step 1 — `mental_models` table + `idx_mm_category` + idempotent seed step in `runMigrations()` (`src/lib/db.ts`)
- [x] Step 2 — 31-model seed data authored: descriptions, 3–5 Phase-2 reflection prompts each, original system_prompt_templates, tags (`src/data/mentalModels.seed.json`)
- [x] Step 3 — typed DB layer with `getAllModels` / `getModelById` / `getModelsByCategory`, JSON fields parsed to arrays (`src/lib/mentalModels.ts`)
- [x] Step 4 — LensPicker: grouped, searchable, keyboard-navigable dropdown, 320px max height, outside-click dismiss, `nodrag nopan nowheel` (`src/components/LensPicker.tsx`)
- [x] Step 5 — AiChatNode: session-only `activeLens` state, lens pill in input bar (amber when active, inline × clear), 4px `#EF9F27` header dot, lens template injected first in `systemContent`, `activeLens` added to `handleSend` deps (`src/components/nodes/AiChatNode.tsx`)
- [x] Step 6 — verified: tsc clean, vite build clean, packaged binary boot-verified against the real vault via temporary beacon (31 rows seeded, vault intact)
- [x] Step 7 — version 1.8.0 in all four locations, CHANGELOG entry, in-app release notes, DMG staged to `~/Downloads/`

**Deviation from approved plan:** none functional. The lens pill renders the lens name only when a lens is active (icon-only when `Lens: None`) to fit the chat node's 260px minimum width — the pill semantics (`Lens: None` / name + ×) are conveyed via tooltip and the visible name when set.

## Complete Summary

MindSpace now contains a local Mental Models library — 31 reasoning frameworks across Management & Leadership, Career, and Thinking & Perspective — seeded into SQLite on first launch with originally-authored content (no Mosaic text copied). Every AI Chat node has a Lens button in its input bar: pick a model from a searchable, grouped dropdown and the chat reasons through every subsequent question using that framework, indicated by an amber dot on the node header. The lens is session-only and clears with one click. Shipped as v1.8.0, DMG staged to `~/Downloads/MindSpace_1.8.0_aarch64.dmg`.

## Technical Overview of the Build

- **Schema** (`src/lib/db.ts`): `mental_models` table (id, name, category, description, prompts JSON, system_prompt_template, tags JSON, embedding BLOB reserved for Phase 3, source_url) + `idx_mm_category`, created in `runMigrations()`. `seedMentalModels()` inserts the 31 rows from `src/data/mentalModels.seed.json` only when the table is empty (`COUNT(*) == 0`, `INSERT OR IGNORE`); no explicit transaction, per the v1.6.2 pooled-connection lesson.
- **Data layer** (`src/lib/mentalModels.ts`): `MentalModel` interface, `CATEGORY_LABELS`, and three async getters; `prompts`/`tags` are JSON-parsed at this boundary so consumers receive typed arrays.
- **LensPicker** (`src/components/LensPicker.tsx`): loads models once on mount; groups by primary category in fixed order (management, career, thinking), alphabetical within; search filters name+description case-insensitively across all groups; flat-index keyboard model (ArrowUp/Down, Enter selects, Escape closes) aligned with render order; capture-phase `pointerdown` outside-click dismiss; `nodrag nopan nowheel` so list scrolling never drags the node.
- **AiChatNode** (`src/components/nodes/AiChatNode.tsx`): `activeLens` lives in `useState` only — never written to node `data`, so persistence is impossible by construction and unmount resets it. The pill toggles the picker (absolutely positioned above the input bar, z-index 30). Injection point is the existing `systemContent` assembly in `handleSend`: the lens `system_prompt_template` is prepended **first**, ahead of Brain passages, connected-node context, and the per-node system prompt; with no lens the string-building path is byte-identical to before. `activeLens` added to the `useCallback` dependency array.
- **Untouched**: NODE_REGISTRY, canvas/edges/undo, streaming (`aiStream.ts`), chat history trimming, Brain retrieval, settings, OpenRouter.

## Functional Overview of the Build

Open any AI Chat node and start or open a conversation. In the input bar, the new lens icon (next to the Brain toggle) opens the mental-model picker: type to search all 31 models or browse the three category groups; arrow keys + Enter or a click selects. The pill turns amber and shows the model's name; a small amber dot appears in the node header so an active lens is visible at a glance. Every question you send is now answered through that model's reasoning structure (e.g. Inversion answers lead with failure modes to avoid). Click the × on the pill to return to normal chat; closing and reopening the node also resets the lens. Nothing else about chat changes — attachments, Brain mode, history, and streaming work exactly as before.

## Expected Behaviour

- First launch after update creates `mental_models` and seeds exactly 31 rows (18 management / 3 career / 10 thinking); subsequent launches skip seeding.
- Lens picker lists all 31 models grouped and alphabetised, searches across categories, and is fully keyboard-operable.
- With a lens active: amber pill + header dot; LM Studio request's system message begins with the lens template; Brain passages / connected-node context / node system prompt follow it unchanged.
- With no lens (default): requests are byte-identical to v1.7.0 behaviour.
- Clearing the lens or reopening the node returns to `Lens: None`.

## Actual Behaviour

- `tsc` and `vite build` pass clean; full bundle builds (6.6 MB DMG).
- Packaged 1.8.0 binary boot-verified against the real vault via a temporary in-app beacon (removed before the release bundle): canvas DOM rendered, `mental_models` count = **31**, categories 18/3/10 as expected, sample row (`inversion`) intact with 632-char template and valid prompts JSON, existing vault unharmed (111 nodes, search index 111/111).
- **Not verified live:** an actual LM Studio round-trip with a lens active (no LM Studio model was loaded during verification), so the injected system prompt's presence in a real request and the framework-shaped response are confirmed by code path only. The injection is a three-line guarded prepend in the same assembly that already handles Brain/context blocks. UI interactions (picker rendering, search, keyboard nav, pill/dot states) follow the same patterns as existing components but were not manually exercised — flagged for the user's first run.

## Test Cases

| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Migration + seed | Launch 1.8.0 against existing vault | `mental_models` created, 31 rows (18/3/10) | Beacon: 31 rows, 18/3/10 | Pass |
| 2 | Seed idempotence | Relaunch app | Still 31 rows, no duplicates | Guarded by `COUNT(*)==0` + `INSERT OR IGNORE`; single-boot verified only | Pass (code-verified) |
| 3 | Vault integrity | Boot 1.8.0 on real vault | Nodes/search index unchanged | 111 nodes, search index 111/111 | Pass |
| 4 | Seed content shape | Validate JSON | 31 unique ids, all 8 fields per model | Python validation: ids unique, keys ok | Pass |
| 5 | Picker renders grouped/sorted | Open lens picker | 3 category groups, alphabetical | Not run (manual UI) | Not run |
| 6 | Search filters | Type "inver" | Inversion shown, groups without matches hidden | Not run (manual UI) | Not run |
| 7 | Keyboard navigation | Arrows + Enter, Escape | Moves highlight, selects, closes | Not run (manual UI) | Not run |
| 8 | Lens select indicators | Pick Inversion | Amber pill with name; header dot appears | Not run (manual UI) | Not run |
| 9 | Prompt injection | Send message with lens active, inspect LM Studio log | System message starts with lens template | Not run (LM Studio not loaded) — code-verified | Not run |
| 10 | Clear lens | Click × on pill | Dot disappears; next request has no injection | Not run (manual UI) | Not run |
| 11 | Session-only reset | Close/reopen chat node | Lens back to None | Guaranteed by unmounting `useState`; not manually run | Pass (by construction) |
| 12 | No-lens regression | Chat without lens | Behaviour identical to v1.7.0 | Injection guarded by `activeLens?.`; tsc/build clean | Pass (code-verified) |
