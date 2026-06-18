# Changelog

All notable changes to MindSpace. Versions follow semantic versioning.

## [v1.10.0] — 2026-06-17

### Added
- **Zen node** (Time category) — a new canvas node that renders a generative, calming audio-visual simulation on a Canvas 2D surface with fully local Web Audio synthesis. Zero assets, zero AI, zero network; runs fully offline and is the cheapest node type to run. ([request file](docs/requests/2026-06-16-zen-node.md))
- Six variations ship at launch: **Pendulum Wave**, **Polyrhythm Orbits**, **Rainfall** (with a brown-noise bed for masking), **Breathing Orb** (4-7-8 and box-breathing, with a guided phase countdown and aria-live phase text), **Fireflies** (Perlin drift + Kuramoto sync), and **Ocean Swell** (pure LFO-driven surf, no chimes).
- Per-node tuning: master volume, space (reverb/delay), speed, density, musical scale / root / tone (C major & A minor pentatonic, Hirajoshi; sine / triangle / kalimba), chime and ambience levels, plus per-variation controls. Save and recall named presets.
- Session timer (Off / 10 / 25 / 45 min) that fades audio out over its final 20 seconds.
- New Automations trigger **"Zen session completed"** (optional variation filter) — wire a finished calm session to a notification, a note, or your Pomodoro flow. No new action types.
- Audio is gesture-gated, the shared AudioContext is created lazily and suspends when nothing is playing, audio keeps playing when a node scrolls offscreen, and canvas rendering pauses offscreen to save CPU.

## [v1.9.0] — 2026-06-12

### Added
- Grid Opacity slider in Settings > Canvas (0–100%, default 100%): fades the canvas dot grid; 0% hides it entirely. ([request file](docs/requests/2026-06-12-grid-opacity-theme-colors.md))
- Grid Color presets in Settings > Canvas that always follow the active theme: **Subtle** (the existing dot→text blend, default), **Text** (theme text color), and **Accent** (theme accent, including a custom accent override). Switching themes recolors the grid live.

### Changed
- The Grid Size slider is now always enabled — it controls the visible grid spacing, not just snapping, so it no longer greys out when Snap to Grid is off.

## [v1.8.2] — 2026-06-12

### Added
- Brain ambient model suggestions: while typing in a Note, Task, AI Chat (draft input), or Mental Model node, up to two relevant mental-model chips surface below the node (1s debounce, cosine similarity ≥ 0.72 against the embedded model library, minimum 20 characters). Final phase of the three-phase Mental Models integration. ([request file](docs/requests/2026-06-12-brain-ambient-model-suggestions.md))
- Clicking a chip spawns a Mental Model node pre-loaded with that model, wired by an edge to the originating node — wiring from an AI Chat node also activates the lens automatically. Dismissing (×) mutes that model for that node for the session. Chips auto-dismiss after 8 seconds (hover pauses), fade in over 150ms, and never appear on widget nodes.
- One-time silent startup job embeds the 31-model library via LM Studio; retries next launch if offline, and suggestions stay silently absent until embeddings exist.

### Changed
- Brain startup jobs now also backfill model embeddings and warm the suggestion cache (no-ops when LM Studio is offline).

## [v1.8.1] — 2026-06-12

### Added
- Mental Model node: a new **Think** category in the node spawn menu. Dropping the node opens the model picker (the 31-model library from v1.8.0); picking a model renders its guided prompt questions as fields that persist to the vault, plus a rich-text Summary (bold/italic/bullets). Dismissing the picker without choosing removes the node. Phase 2 of the three-phase Mental Models integration. ([request file](docs/requests/2026-06-12-mental-model-node-type.md))
- "Summarise with AI" on the Mental Model node: streams a one-paragraph synthesis of your prompt responses from LM Studio into the Summary field (max 300 tokens), with a Stop button mid-stream.
- Wiring a Mental Model node to an AI Chat node (either direction) activates that model as the chat's lens — amber dot shows; deleting the wire clears it. The wiring is persisted, so a wired lens survives app restarts.
- Model swap button on the node header, behind an inline confirmation when responses exist (swapping clears responses and summary).
- Mental Model responses and summary are indexed by global search.

## [v1.8.0] — 2026-06-12

### Added
- Mental Models library: 31 reasoning frameworks (Management & Leadership, Career, Thinking & Perspective) seeded into the local vault on first launch. Phase 1 of the three-phase Mental Models integration; the table and typed access layer are shared with the upcoming model node (Phase 2) and Brain suggestions (Phase 3). ([request file](docs/requests/2026-06-12-mental-model-chat-lens.md))
- AI Chat Lens: a lens button in every chat node's input bar applies any mental model as a reasoning framework — the model's framework is injected ahead of the system prompt so replies reason through that structure. Session-only; clearing the lens or reopening the node returns the chat to normal.
- Lens picker: searchable dropdown grouped by category, alphabetical within groups, full keyboard navigation (arrows, Enter, Escape), descriptions per model.
- Amber indicator dot on the chat node header while a lens is active.

## [v1.7.0] — 2026-06-12

### Added
- The canvas is alive: node cards, the ambient glow-dot layer, and (with the Ripple style) the grid dots themselves react as the cursor moves across the canvas — glow, lift, and brighten with smooth distance falloff. Three selectable effect styles: Hover (only the card under the cursor), Proximity (everything near the cursor), Ripple (proximity plus the grid). ([request file](docs/requests/2026-06-12-node-fx-color-visibility.md))
- Hover Effects controls in Settings > Canvas: master toggle, effect style, intensity slider, and separate toggles for the node-card and ambient layers.
- Node Opacity slider (40–100%) in Settings > Canvas to fade node cards into the canvas.

### Changed
- Node Color now also tints the node cards — selection border and glow — instead of only the ambient background layer.

## [v1.6.2] — 2026-06-12

### Fixed
- Global search returned nothing: the boot-time index rebuild wrapped its inserts in raw BEGIN/COMMIT on a pooled DB connection, collided with parallel startup queries, and rolled back on every launch — leaving the index empty. The rebuild now runs without the fragile transaction and only when the index is out of sync with the vault. The same raw-transaction hazard was removed from node deletion and canvas import. ([request file](docs/requests/2026-06-12-search-fix-sidebar-search-grid.md))
- Canvas dot grid ignored the Grid Size setting (hardcoded 20px — only snapping obeyed the setting).

### Added
- Search button in the sidebar (above Settings) with a ⌘K hint — global search is now discoverable without knowing the shortcut.

### Changed
- Canvas grid is clearly visible: dots are larger and their color blends toward the theme text color instead of sitting near-invisible against the background.

## [v1.6.1] — 2026-06-12

### Fixed
- Black screen at startup: an unstable selection-change callback put the canvas into an infinite React render loop the moment nodes loaded, crashing the UI (first packaged build surfaced it; dev was equally affected). Selection handler is now identity-stable with a no-change bail-out; fitView/snap-grid props no longer churn React Flow's store. ([request file](docs/requests/2026-06-12-fix-startup-render-loop.md))

## [v1.6.0] — 2026-06-11

### Added — "Platform"
- **Menubar capture**: a tray icon opens a lightweight always-on-top capture popover — dump a note or task into the Inbox from anywhere, with the main window closed. Captures are indexed, embedded, and auto-triaged like any other Inbox item. ([request file](docs/requests/2026-06-11-phase-3-platform.md))
- **Automations (rules engine)**: Settings → Automations builds when-X-do-Y rules. Triggers: node created (type/canvas filter), task due today / overdue, RSS item matching keywords, daily schedule. Actions: native notification (with {title}/{match}/{date} templates), create a note in a chosen canvas, move the node to a canvas, run Inbox triage. Each trigger instance fires exactly once (persistent dedupe); rules show their last run and can be edited, disabled, or deleted.
- **Node registry**: all 33 node types now register in a single `NODE_REGISTRY` (component, icon, label, category, default size, default data) — the picker, canvas, and editor all derive from it, so a new node type is one component file plus one registry entry. The node editor header now shows the right icon for every type.

### Changed
- Second `capture` window and tray icon added to the Tauri shell (window hide/show/focus permissions scoped in capabilities).

## [v1.5.1] — 2026-06-11

### Changed
- Project-wide no-emoji policy: every emoji replaced with lucide-react icons — lock badge, weather glyphs, currency flags (now code badges), habit streak flame, countdown celebration, checkmarks, Inbox project name ("📥 Inbox" → "Inbox", old name still recognized). ([request file](docs/requests/2026-06-11-no-emoji-icon-policy.md))

## [v1.5.0] — 2026-06-11

### Added — "The Brain"
- **Local semantic memory**: every node's content is chunked and embedded via LM Studio (`/v1/embeddings`), stored in SQLite, searched with in-memory cosine — nothing leaves the machine. Incremental re-embedding on edit; rebuild button in Settings → Brain. ([request file](docs/requests/2026-06-11-phase-2-the-brain.md))
- **Brain chat**: Brain toggle on both chat surfaces retrieves the best passages from the entire vault (hybrid keyword+semantic) into context; replies carry citation chips that jump to the source node.
- **Inbox + auto-file triage**: Quick Capture defaults to a system Inbox; the local model classifies each dump and moves it to the best canvas (one undoable step each, confidence threshold configurable). Sidebar badge + "File now" button.
- **Today panel**: once-a-day digest — triage recap, resurfaced notes (old but semantically related to current work), stale tasks — with jump links and one-click insert into a Daily Journal node.
- **Knowledge graph**: entity extraction over content, a Related strip on every node editor (backlinks + accept-able AI suggestions, cross-canvas links), and a read-only graph view (⌘⇧G).

### Changed
- Quick-captured notes now keep the full dump as note body (first line becomes the title).
- All brain features degrade gracefully when LM Studio is offline: keyword search keeps working, triage and digest pause without errors.

## [v1.4.0] — 2026-06-11

### Added
- Global search (⌘K): FTS5 full-text index over every node's content across all projects, with fuzzy prefix matching, snippets, and jump-to-node (switches project/canvas, centers and selects the node). ([request file](docs/requests/2026-06-11-phase-1-core-ux.md))
- Canvas undo/redo (⌘Z / ⇧⌘Z): node add/delete/move/resize/edit and edge changes, with rapid edits coalesced and multi-node operations undone as one step.
- Streaming AI responses in both the canvas chat node and the editor modal, with a Stop button that cancels generation server-side.
- ⌘D duplicates the selected nodes; ⌘G groups them.
- Alignment toolbar on multi-select: align left/center/right/top/middle/bottom, distribute horizontally/vertically.
- Padlock badge on locked nodes.

### Changed
- Store refactored into data / ui / settings / history slices (same public API).
- New `http_post_stream` + `cancel_stream` Tauri commands (same host allowlist as `http_post`).

## [v1.3.0] — 2026-06-11

### Fixed
- Typing mid-content in notes no longer garbles or loses text — store updates are now optimistic (state before DB write), the note editor's debounced save no longer captures stale data, and closing the editor flushes pending changes instead of discarding them. ([request file](docs/requests/2026-06-11-phase-0-stabilize.md))
- Text in AI chat messages (canvas node and editor modal) can now be drag-selected and copied.

### Added
- Automatic SQLite backup on every launch via `VACUUM INTO` (last 10 kept in app-data/backups).
- Canvas export to JSON and import as a new canvas, from the sidebar.
- Per-node error boundary: a crashing node shows a Retry card instead of taking down the canvas.

### Changed
- Security hardening: Content Security Policy enabled; `http_post` (carries API keys) restricted to localhost + OpenRouter; `http_get` restricted to http/https.
- Canvas rendering memoized (cached node conversion + `React.memo` on all 33 node components); SQLite indexes added on canvas/edge lookups; node deletion is now transactional.

## [v1.2.0] — May 2026
- STT node (speech-to-text, OpenRouter Chirp) and TTS node (macOS `say`).

## [v1.1.1] — May 2026
- CosmicNode variants: Boson, Vector, Shapes Grid.

## [v1.1.0] — May 2026
- CosmicNode, BeatMaker, edge particle animation + toggle, transparent-corner fix.

## [v1.0.0] — May 2026
- Initial release: spatial canvas, 30+ node types, LM Studio/OpenRouter AI, quick capture, themes, SQLite persistence.
