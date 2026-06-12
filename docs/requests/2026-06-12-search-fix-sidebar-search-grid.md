# Search Returns Nothing + Sidebar Search Button + Visible/Bigger Canvas Grid

- **Status:** 🟢 Complete
- **Date raised:** 2026-06-12
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-12 — "Approve (Recommended)" via in-session prompt
- **Release version:** v1.6.2

## Requested Feature
1. **Bug:** ⌘K search opens but fetches no results.
2. **Enhancement:** add a search entry point in the sidebar, above the Settings option.
3. **Enhancement:** make the canvas grid more visible and bigger.

## Diagnosis (evidence, from the live vault, read-only)
- **Search:** the vault has 111 nodes but `search_index` contains exactly 1 row. `rebuildSearchIndex()` runs at every boot and wraps `DELETE` + 111 `INSERT`s in raw `BEGIN`/`COMMIT` statements. tauri-plugin-sql executes statements on a **connection pool**, so the transaction statements and the concurrent boot queries (projects/canvases/nodes/brain jobs) land on different connections — the transaction errors and `ROLLBACK` wipes the index, every single boot. An offline replay of the identical inserts against a copy of the vault succeeds 111/111, proving the data is fine and the transaction handling is the fault. The same raw-transaction hazard exists in `deleteNode` (dataSlice) and `importCanvas` (canvasIO).
- **Grid:** the painted dot grid uses a hardcoded `GRID_GAP = 20` and ignores the existing Grid Size setting — the user has already set Grid Size to 40px and only snapping obeys it. Dot visibility: theme `dot` colors (e.g. `#0a0c1e` on background `#07091a`) are nearly invisible by design, and dot radius is 1px.
- **Search discoverability:** ⌘K is currently the only entry point (no visible button anywhere).

## Plan
1. **Fix the search index (root cause)** — `src/lib/search.ts`:
   - Remove raw `BEGIN`/`COMMIT` from `rebuildSearchIndex`; insert per-row with per-row error tolerance so the rebuild converges even under concurrency.
   - Only rebuild when out of sync (compare `COUNT(nodes)` vs `COUNT(search_index)`), instead of wiping and rebuilding every boot — removes the boot-time concurrency window entirely; incremental `upsertNodeIndex` remains the primary path.
   - Same-hazard cleanup: drop raw `BEGIN`/`COMMIT` from `deleteNode` (dataSlice) and `importCanvas` (canvasIO), replacing with sequential awaited statements (order chosen so a mid-failure cannot orphan data: delete children/edges before the parent; import inserts canvas first).
2. **Sidebar search button** — `Sidebar.tsx`: a Search button (lucide `Search` icon + "⌘K" hint) in the sidebar bottom area directly above the Settings button, calling `setSearchOpen(true)`.
3. **Grid: bigger + visible** — `Canvas.tsx` BackgroundCanvas:
   - Paint the grid from `settings.grid_size` (single source of truth with snapping; the saved 40px takes effect immediately).
   - Visibility: dot radius 1 → 1.4 and a brighter dot rendering (blend the theme dot color toward the theme text color so it reads on every theme; no per-theme file churn).
4. v1.6.2 bumps, CHANGELOG, in-app release notes; tsc + vite build + cargo check; **boot-verify the built binary against the real vault** (per the new standing rule) including a real ⌘K query via the DB; closeout.

## Out of Scope
- Search ranking/recency improvements, fuzzy matching (future).
- A grid-style picker (lines vs dots) or per-theme grid color settings.
- The deeper question of configuring tauri-plugin-sql's pool size.

## Acceptance Criteria
- [x] After launch, `search_index` row count equals node count — verified against the real vault: 111/111 after an instrumented boot; FTS prefix queries return real content ("Brand Positioning" notes). In-UI jump still needs a manual click-through.
- [ ] Search button appears above Settings in the sidebar and opens the palette. _(implemented; visual check pending user relaunch)_
- [ ] Dot grid spacing follows the Grid Size setting (40px in the current vault) and is clearly visible on the default theme. _(implemented; visual check pending user relaunch)_
- [x] No raw `BEGIN`/`COMMIT` statements remain anywhere in the frontend code (grep-verified).
- [x] tsc + vite build + cargo check pass; built binary boot-verified (both windows mount, no warnings, no errors).

## Progress
- [x] search.ts: raw BEGIN/COMMIT removed; `syncSearchIndex` rebuilds only on node/index count drift, with 3 attempts at 0s/2s/8s; per-row insert error tolerance.
- [x] Discovered during verification (instrumented boots against the real vault):
  - PRAGMAs return rows, so they fail through the plugin's `execute()` — `journal_mode=WAL` and `busy_timeout=3000` now applied via `select()` in db.ts.
  - The capture window booting alongside the main window raced the same per-second backup filename ("table projects already exists") — auto-backup now runs in the main window only.
  - The RUNNING v1.6.1 instance held a permanent write lock (its old rebuild's orphaned `BEGIN` on a pooled connection), locking out all writers in every process — the v1.6.2 code can no longer produce such zombies; old instance must be quit before first v1.6.2 launch.
- [x] dataSlice.deleteNode and canvasIO.importCanvas: raw transactions replaced with failure-ordered sequential statements (children/edges before parent; nodes before edges).
- [x] Sidebar.tsx: full-width Search pill (Search icon, ⌘K badge) directly above the bottom bar/Settings.
- [x] Canvas.tsx: grid spacing now reads `settings.grid_size` (user's saved 40px takes effect); dot radius 1 → 1.4; dot color blended 35% toward the theme text color.
- [x] v1.6.2 bumps, CHANGELOG, in-app release notes; final DMG built and shipped to ~/Downloads.

## Complete Summary
Global search was silently broken for the entire life of the vault: the index rebuild aborted on every launch, so ⌘K had (almost) nothing to search. The rebuild now converges reliably (no pooled-connection transactions, WAL, busy timeout, retry-on-drift), and the same fragile transaction pattern was removed from node deletion and canvas import. Search gained a visible sidebar entry point above Settings, and the canvas grid now honors the Grid Size setting and is actually visible.

## Technical Overview of the Build
- `src/lib/search.ts`: `initSearchIndex` → `syncSearchIndex` (count-drift check, 3 retries) → `rebuildSearchIndex` (transaction-free, per-row error tolerance).
- `src/lib/db.ts`: `PRAGMA journal_mode=WAL` + `busy_timeout=3000` applied via `select()` at connection time; auto-backup gated to the main window.
- `src/store/slices/dataSlice.ts` / `src/lib/canvasIO.ts`: raw BEGIN/COMMIT removed, statement order chosen so partial failure cannot orphan references.
- `src/components/sidebar/Sidebar.tsx`: Search pill row above the bottom bar.
- `src/components/canvas/Canvas.tsx`: BackgroundCanvas takes a `gridSize` prop fed from `settings.grid_size`; `GRID_DOT_R` 1.4; dot color = theme dot blended 35% toward theme text.

## Functional Overview of the Build
⌘K (or the new sidebar Search button) now finds content across the whole vault and jumps to it. The canvas grid matches the Grid Size slider (40px in this vault) and reads clearly on every theme.

## Expected Behaviour
Search returns results for any indexed node text; sidebar shows Search above Settings; grid follows the setting and is visible.

## Actual Behaviour
Instrumented production boots against the real vault: index converged 1/111 → 111/111, FTS queries return real notes, both windows mount with zero warnings. The sidebar button and grid rendering compile and ship but were not visually inspected (CLI cannot see the window) — pending the user's relaunch.

## Test Cases
| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Index converges on real vault | Boot release binary, count index rows | 111/111 | 111/111 | ✅ Pass |
| 2 | FTS query returns content | Prefix MATCH against real index | Real titles returned | "Brand Positioning…" rows returned | ✅ Pass |
| 3 | Boot health | Beacon boot-check both windows | Roots mounted, no errors/warnings | Clean | ✅ Pass |
| 4 | No raw transactions | grep BEGIN/COMMIT in src/ | None | None | ✅ Pass |
| 5 | ⌘K palette end-to-end in UI | Search, click result | Jumps to node | Not run (manual) | Not run |
| 6 | Sidebar Search button | Click button above Settings | Palette opens | Not run (manual) | Not run |
| 7 | Grid visibility/size | View canvas at 100% zoom | 40px spacing, visible dots | Not run (manual) | Not run |
| 8 | tsc / build / cargo | run all | Pass | All pass | ✅ Pass |
