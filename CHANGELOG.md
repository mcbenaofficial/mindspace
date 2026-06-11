# Changelog

All notable changes to MindSpace. Versions follow semantic versioning.

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
