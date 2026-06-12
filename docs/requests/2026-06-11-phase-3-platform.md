# Phase 3 — Platform: Menubar Capture, Node SDK, Rules Engine

- **Status:** 🟢 Complete
- **Date raised:** 2026-06-11
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-11 — approved as planned via in-session prompt
- **Release version:** v1.6.0

## Requested Feature
Phase 3 of the audit roadmap, scoped per Q&A: capture from anywhere on the Mac without opening the app, make adding new node types one-file cheap, and a general when-X-do-Y automations builder.

## Clarifications (Q&A)
- **Sync?** → **Deferred** (user decision). No multi-device work this phase; revisit when the need is real. Auto-backups (v1.3.0) remain the safety net.
- **Capture companions?** → **Menubar capture**: a tray icon with a small always-on-top capture popover that writes straight to the Inbox (and triggers triage) without the main window being open. No mobile/PWA this phase.
- **Plugin SDK?** → **Internal node contract**: consolidate the 4+ scattered registration points (nodeTypes map, NodePicker options, Canvas default sizes, Canvas default data, modal NODE_META) into ONE registry so a new node = component file + one registry entry. No third-party sandboxing.
- **Automations?** → **Rules engine UI**: a general builder (trigger + action), with the preset ideas (task reminders, RSS keyword watch) expressed as trigger/action types inside the engine rather than hardcoded features.

## Architecture decisions
- **Menubar window**: a second lightweight Tauri window (label `capture`, frameless, always-on-top, hidden by default) rendering a minimal capture UI from the same bundle (branch on window label in `main.tsx`). Tray icon built in Rust (`tauri::tray`); left-click toggles the popover near the cursor. The capture window writes via the shared SQLite plugin connection and emits a `mindspace://captured` event; the main window (if open) refreshes the inbox badge and schedules triage. A `busy_timeout` guards concurrent writes.
- **Node registry**: new `src/components/nodes/registry.ts` — one `NODE_REGISTRY: Record<NodeType, NodeDef>` where `NodeDef = { component, label, icon, category, defaultSize, defaultData() }`. `nodeTypes`, NodePicker categories/options, Canvas `DEFAULT_NODE_SIZES`/`getDefaultData`, and modal `NODE_META` all derive from it. Behavior-neutral refactor verified by typecheck.
- **Rules engine**: `rules` table (trigger/action as JSON) + `src/lib/rules/engine.ts`. Triggers: **node created** (type/canvas filter), **task due/overdue**, **new RSS item matching keywords**, **daily schedule (HH:MM)**. Actions: **notify** (native notification), **create note** (target canvas, template), **move node to canvas**, **run inbox triage**. Engine ticks every 60s for time-based triggers + hooks `addNode` for event triggers; per-rule fired-keys state prevents duplicate firing. UI: "Automations" section in Settings — rule list with enable toggles, add/edit form (trigger picker → params, action picker → params), last-run display.

## Plan
1. Rust: tray icon + `capture` window config (frameless, always-on-top, skip-taskbar); show/hide command positioned near cursor.
2. Frontend: `CaptureApp` branch in `main.tsx` for the capture window — text box + type pills + Inbox default, Enter to save, Esc to hide; writes node + search-index row, emits captured event.
3. Main window: listen for captured events → refresh inbox badge, schedule triage.
4. `registry.ts` + refactor the four consumer sites; delete the now-redundant maps.
5. `rules` schema + engine (tick loop, addNode hook, fired-keys dedupe, action executor using the notification plugin).
6. Settings → Automations UI (list, builder form, enable/disable, delete, last-run).
7. v1.6.0 bump, CHANGELOG, Settings release notes; tsc + vite build + cargo check; closeout (request file, ledger, metrics).

## Out of Scope
- Multi-device sync (deferred by decision), mobile/PWA capture.
- Third-party/sandboxed plugins and a plugin gallery.
- Cross-platform (Windows/Linux) TTS/STT parity — app remains macOS-first this phase.
- Webhook/external-service actions in the rules engine (local-only actions v1).

## Acceptance Criteria
- [ ] Tray icon present; clicking it opens the capture popover with the main window closed; captured text lands in Inbox and gets triaged. _(implemented; needs manual verification in the running app)_
- [x] Adding a hypothetical new node type requires exactly: one component file + one registry entry (verified by code inspection).
- [ ] A rule "when a task is overdue → notify" fires a native notification once per task/due-date. _(implemented; needs manual verification)_
- [ ] A rule "when RSS item matches keyword → create note" produces the note in the chosen canvas. _(implemented; needs manual verification)_
- [ ] A daily-schedule rule fires once on the scheduled day/time when the app is running. _(implemented; needs manual verification)_
- [ ] Rules can be created, edited, disabled, and deleted from Settings. _(implemented; needs manual verification)_
- [x] tsc + vite build + cargo check pass clean.

## Progress
- [x] Step 4 (registry) — `src/components/nodes/registry.tsx` created: `NODE_REGISTRY: Record<NodeType, NodeDef>` with all 33 types (component wrapped in withNodeBoundary, label, lucide icon type, category, defaultSize, defaultData()). Consumers refactored: `nodes/index.ts` is now a re-export; Canvas.tsx dropped its 33-entry DEFAULT_NODE_SIZES + getDefaultData switch (~110 lines) and imports getDefaultSize/getDefaultData; NodePicker derives categories + options from the registry (dropped NODE_OPTIONS array + 33 lucide imports); NodeEditorModal NODE_META map replaced by a NODE_REGISTRY lookup — the modal header now shows the correct icon/label for ALL types, not just the 10 previously listed. Deviation note: modal label for project-hub is now "Project" (registry canonical) instead of "Project Hub". QuickCaptureModal keeps its local capture-tuned sizes (intentionally smaller than canvas defaults; not a registration site). `npx tsc --noEmit` clean.
- [x] Steps 1-3 (tray + capture window) — Cargo.toml: `tray-icon` feature added; lib.rs setup builds a template-icon tray (left-click toggles the capture window, positioned centered under the click, hide if already visible). tauri.conf.json: second window `capture` (520x280, frameless, transparent, always-on-top, hidden, skip-taskbar, url `index.html?capture=1`); capabilities now cover both windows + window hide/show/set-focus permissions. Frontend: `src/CaptureApp.tsx` (theme from shared settings table, note/task pills, Enter saves / Shift+Enter newline / Esc or blur hides, writes to Inbox via ensureInbox + addNode — which also indexes, embeds, and runs node-created rules — then emits `mindspace://captured`); main.tsx branches on `?capture=1`; App.tsx listens for the event → refreshInboxCount + delayed triageInbox([nodeId]) when triage is enabled. tsc + cargo check clean.
- [x] Step 5 (rules engine) — `rules` table added to db.ts (trigger_json/action_json/state_json — `trigger` is a reserved SQLite word); `src/lib/rules/engine.ts` with triggers (node-created with type/canvas filter, task-due due-today|overdue, rss-match keyword scan over rss-reader node items, schedule HH:MM once/day) and actions (notify via plugin-notification with {title}/{match}/{date} templates, create-note — store.addNode when target IS the active canvas so it appears live, direct SQL + search/embedding hooks otherwise, move-to-canvas via brainSlice.moveNodeToCanvas, run-triage). Fired-keys dedupe in state_json capped at 500; 60s tick started from App.tsx effect; notifyNodeCreated hooked into dataSlice.addNode (fire-and-forget). Registry imported dynamically inside create-note to keep node components out of the store module graph.
- [x] Step 6 (Automations UI) — `src/components/settings/AutomationsSection.tsx`: rule list (enable toggle, trigger→action summary, last-run, edit, delete) + builder form (trigger picker with per-kind params, action picker with per-kind params, canvas dropdowns joined with project names). Mounted as a collapsible "Automations" section in SettingsPanel between Brain and Canvas. tsc clean.
- [x] Step 7 — v1.6.0 bumped in package.json + tauri.conf.json; CHANGELOG entry; Settings release notes updated (v1.6 marked Current, no emojis); footer version string. `npx tsc --noEmit`, `npm run build`, `cargo check` all pass.

## Complete Summary
Phase 3 turns MindSpace from an app into a small platform: a menubar tray icon captures thoughts into the Inbox from anywhere on the Mac (main window closed), every node type now registers through a single internal registry (new widgets are one file + one entry), and a general Automations rules engine in Settings runs when-X-do-Y rules — task reminders, RSS keyword watches, daily schedules, auto-created notes, and triage runs — with native notifications. Shipped as v1.6.0.

## Technical Overview of the Build
- **Node registry** — `src/components/nodes/registry.tsx`: `NODE_REGISTRY: Record<NodeType, NodeDef>` where `NodeDef = { component (withNodeBoundary-wrapped), label, icon (lucide component type), category, defaultSize, defaultData() }`. `nodes/index.ts` re-exports; Canvas, NodePicker, and NodeEditorModal all derive (the modal previously knew only 10 of 33 types). ~190 lines of duplicated registration data deleted across the four old sites.
- **Rules engine** — `rules` table in `db.ts` (`trigger_json`/`action_json`/`state_json`/`last_run`; `trigger` is reserved in SQLite). `src/lib/rules/engine.ts`: rule CRUD shared with the UI, a 60-second tick loop started from App.tsx, and a `notifyNodeCreated` hook called fire-and-forget from `dataSlice.addNode`. Triggers: node-created (type/canvas filters), task-due (due-today | overdue, skips done tasks), rss-match (keyword scan over rss-reader node items), schedule (first tick at/after HH:MM daily). Actions: notify (`@tauri-apps/plugin-notification`, permission-checked, `{title}/{match}/{date}` templates), create-note (store.addNode when the target is the active canvas so it appears live and undoable; direct SQL + search/embedding hooks otherwise), move-to-canvas (reuses `brainSlice.moveNodeToCanvas`, so it is history-recorded), run-triage. Per-rule fired-keys persisted in `state_json` (capped at 500) guarantee once-per-instance firing across restarts. The registry is imported dynamically inside create-note so the engine never drags node components into the store module graph.
- **Automations UI** — `src/components/settings/AutomationsSection.tsx`: rule list (enable toggle, trigger→action summary, last-run timestamp, edit, delete) and a builder form with per-kind parameter fields; canvas dropdowns query SQLite directly and show "Project / Canvas". Mounted as a collapsible Settings section.
- **Menubar capture** — Cargo `tray-icon` feature; `lib.rs` setup builds a template tray icon whose left-click toggles the `capture` window, positioned centered under the click (hide if visible). `tauri.conf.json` declares the second window (520x280, frameless, transparent, always-on-top, hidden at boot, skip-taskbar, `index.html?capture=1`); capabilities extended to both windows plus hide/show/set-focus. `src/main.tsx` branches on `?capture=1` to render `src/CaptureApp.tsx`: themed via the shared settings table, note/task pills, Enter saves / Shift+Enter newline / Esc or focus-loss hides. Saves go through `ensureInbox` + `addNode` (so captures are search-indexed, embedded, and visible to node-created rules), then `emit("mindspace://captured", { nodeId })`. App.tsx listens and refreshes the Inbox badge + schedules `triageInbox([nodeId])` after 1.5s when triage is enabled.

## Functional Overview of the Build
- A MindSpace icon now sits in the macOS menubar. Click it and a small dark popover appears: type a thought, pick Note or Task, press Enter — it lands in the Inbox, gets indexed, and (with triage on) is auto-filed to the right canvas. Esc or clicking away dismisses it. The main window never needs to be open.
- Settings → Automations: create rules like "when a task is overdue → notify me", "when an RSS item mentions 'tauri' → create a note in Research", or "daily at 09:00 → run Inbox triage". Rules can be named (or auto-named), edited, toggled, and deleted; each shows when it last ran. Every distinct event fires its action exactly once.
- Invisible but structural: adding a future node type now means writing the component and one registry entry — the picker, canvas defaults, error boundary, and editor header all follow automatically.

## Expected Behaviour
Per acceptance criteria: tray capture works with the main window closed; new node types need one file + one entry; task-overdue notifies once per task/due-date; RSS keyword rules create notes in the chosen canvas; daily schedule rules fire once per day while the app runs; rules are fully manageable from Settings; all build checks pass.

## Actual Behaviour
`npx tsc --noEmit`, `npm run build`, and `cargo check` all pass clean. Registry one-entry claim verified by code inspection (the four former registration sites now derive from `NODE_REGISTRY`). Live UI behaviour (tray click, capture popover, notification delivery, rule firing timing) was not exercised this session — the desktop app and macOS notification permission cannot be driven from the CLI; needs a manual pass in the running app. Two known design notes: (1) the editor-modal label for project-hub changed from "Project Hub" to the registry-canonical "Project"; (2) if the capture window saves while the main window is also open, node-created rules are evaluated by the capture window's engine instance — the persistent fired-keys dedupe prevents double-firing from the main window's tick loop.

## Test Cases
| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Typecheck / build / cargo | run all three | Pass | All pass | ✅ Pass |
| 2 | Registry derivation | Inspect picker, canvas, modal, nodeTypes | All derive from NODE_REGISTRY; no duplicated tables remain | Verified by inspection | ✅ Pass |
| 3 | Tray capture, main window closed | Quit main window, click tray, type, Enter | Note in Inbox, triaged | Not run | Not run |
| 4 | Capture dismiss | Esc / click away | Popover hides, text cleared | Not run | Not run |
| 5 | Task-overdue rule | Create rule, task with past due date | One notification per task/due-date | Not run | Not run |
| 6 | RSS keyword rule | Rule with keyword matching a feed item | Note created in chosen canvas, once per item | Not run | Not run |
| 7 | Schedule rule | Daily 09:00 rule, app open past 09:00 | Fires once that day | Not run | Not run |
| 8 | Rule management | Create, edit, toggle, delete in Settings | List reflects every change; last-run shown | Not run | Not run |
| 9 | New node type cost | Hypothetical: add a type | One component file + one registry entry | Verified by inspection | ✅ Pass |
