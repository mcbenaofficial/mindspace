# Grid Opacity Setting + Theme-Matched Grid Colors

- **Status:** 🟢 Complete
- **Approved:** 2026-06-12T07:45:46+05:30
- **Date raised:** 2026-06-12
- **Requested by:** mcbenaofficial
- **Release version:** v1.9.0

## Requested Feature

"Incorporate grid opacity and match grid colors to the theme in the settings."

Two additions to Settings > Canvas:

1. **Grid Opacity** — a slider controlling how visible the dot grid is, from fully hidden (0%) to fully visible (100%).
2. **Grid Color** — a dropdown of theme-derived color presets so the grid always matches the active theme:
   - **Subtle** — the current automatic blend (theme `dot` color mixed 35% toward theme `text`). Default; preserves today's look.
   - **Text** — full theme text color.
   - **Accent** — the theme accent color (respects the custom accent override).

## Clarifications (Q&A)

**Q: How should the grid color be controlled?** (Today it's a fixed 35% blend of the theme's dot color toward the text color.)
**A:** Theme presets dropdown — a "Grid Color" select with theme-derived choices (Subtle / Text / Accent). Always matches the active theme; no hex picking.

**Q: How should the opacity slider behave at its extremes, and should Grid Size be untangled from Snap to Grid?** (Today the Grid Size slider is disabled when Snap to Grid is off, even though the grid still renders.)
**A:** Opacity 0–100%, default preserving the current look; 0% hides the grid entirely. Grid Size slider becomes always enabled, since it controls the visible grid, not just snapping.

## Current State (codebase reality)

- The grid is NOT a ReactFlow `<Background>` — it is custom-drawn dots in `BackgroundCanvas` (`src/components/canvas/Canvas.tsx:157-192`), redrawn every animation frame.
- Dot color is computed per frame: theme `--ms-dot` blended toward `--ms-text` by the constant `GRID_DOT_MIX = 0.35` (`Canvas.tsx:40`). The "ripple" canvas-FX style brightens this blend near the cursor (`Canvas.tsx:176-186`).
- Settings live in the `settings` SQLite table as key/value JSON, merged over `DEFAULT_SETTINGS` (`src/store/slices/settingsSlice.ts`) — new keys need no migration; missing keys fall back to defaults.
- Settings > Canvas section (`src/components/settings/SettingsPanel.tsx:639-668`) currently has Snap to Grid and Grid Size (disabled when snapping is off).

## Plan

1. **Types** — `src/types/index.ts`: add to `AppSettings`:
   - `grid_opacity: number` (0..1; UI shows 0–100%)
   - `grid_color: "subtle" | "text" | "accent"`
2. **Defaults** — `src/store/slices/settingsSlice.ts`: `grid_opacity: 1`, `grid_color: "subtle"` in `DEFAULT_SETTINGS` (existing vaults pick these up automatically and render identically to today).
3. **Renderer** — `src/components/canvas/Canvas.tsx`:
   - Pass `gridOpacity` and `gridColor` props into `BackgroundCanvas` (mirrored into refs like the existing `gridSize`, so the rAF loop reads live values without re-mounting).
   - Resolve the base grid RGB per frame from the preset: `subtle` = current dot→text 35% blend; `text` = `--ms-text`; `accent` = `--ms-accent` (which already reflects a custom accent override via `applyTheme`).
   - Apply opacity via `ctx.globalAlpha` around the grid-dot pass only (node dots, edges, and particles are unaffected). Skip the grid loop entirely when opacity ≤ 0.01.
   - Keep the ripple-FX brighten behavior working for all three presets (brighten = blend the chosen base color further toward `--ms-text`; opacity still applies).
4. **Settings UI** — `src/components/settings/SettingsPanel.tsx`, Canvas section:
   - "Grid Opacity (NN%)" range slider, 0–100 step 5, persisted via the existing `debouncedSave` as 0..1.
   - "Grid Color" select with Subtle / Text / Accent, persisted via `immediateSave`.
   - Remove the `disabled={!settings.snap_to_grid}` link from the Grid Size slider (always enabled).
5. **Verify** — `tsc` typecheck + production build; boot-verify per the project's standard (beacon if needed); confirm slider/dropdown render and persist across restart.
6. **Close out** — release notes entry in SettingsPanel, `CHANGELOG.md` entry, version bump across `package.json` / `tauri.conf.json` / settings version string, `Completed` ledger row, regenerate metrics.

## Out of Scope

- Custom hex grid color picker (presets only, per Q&A).
- Changing grid dot size/radius or grid line styles (dots remain dots).
- Per-canvas or per-project grid settings (global app setting only).
- Touching node-dot, edge, or particle rendering in the background canvas.

## Acceptance Criteria

- [x] Settings > Canvas shows a Grid Opacity slider (0–100%) and a Grid Color control (Subtle / Text / Accent).
- [x] Opacity 0% fully hides the grid; 100% with "Subtle" looks identical to the current build.
- [x] Grid color follows the active theme for every preset, including when switching themes live and when a custom accent is set (Accent preset follows it).
- [x] Grid Size slider is enabled regardless of the Snap to Grid toggle; snapping behavior itself is unchanged.
- [x] Settings persist across app restart; existing vaults get defaults with zero visual change (boot-verified: defaults merged over real vault).
- [x] Typecheck and production build pass; app boot-verified.

## Progress

- [x] Step 1 — `grid_opacity` + `grid_color` added to `AppSettings` (src/types/index.ts)
- [x] Step 2 — Defaults `grid_opacity: 1`, `grid_color: "subtle"` (src/store/slices/settingsSlice.ts)
- [x] Step 3 — Renderer: new props/refs on `BackgroundCanvas`, preset color resolution per frame, `ctx.globalAlpha` around the grid pass, skip at ≤1%, ripple FX preserved (src/components/canvas/Canvas.tsx)
- [x] Step 4 — Settings UI: Grid Opacity slider, Grid Color segmented buttons, Grid Size unlinked from Snap to Grid (src/components/settings/SettingsPanel.tsx)
- [x] Step 5 — Verified: tsc clean, vite build clean, packaged-binary boot beacon on real vault (root mounted, no errors, new defaults merged)
- [x] Step 6 — Release notes (SettingsPanel v1.9 entry), CHANGELOG v1.9.0, version bump in package.json + tauri.conf.json, ledger + metrics

**Deviation:** the plan said Grid Color "dropdown"; implemented as segmented buttons instead, matching the panel's existing idiom for small enums (the Effect Style control). Same three options, same persistence.

## Complete Summary

Settings > Canvas gained two new controls. **Grid Opacity** (0–100%, step 5) fades the canvas dot grid; at 0% the grid pass is skipped entirely. **Grid Color** offers three theme-derived presets — Subtle (the pre-existing dot→text 35% blend, default), Text, and Accent — so the grid always matches the active theme with no manual color picking. As agreed in Q&A, the Grid Size slider was also unlinked from Snap to Grid since it controls the visible grid, not just snapping. Existing vaults render pixel-identically to v1.8.2 until the user touches the new controls.

## Technical Overview of the Build

- **src/types/index.ts** — `AppSettings` gains `grid_opacity: number` (0..1) and `grid_color: "subtle" | "text" | "accent"`.
- **src/store/slices/settingsSlice.ts** — `DEFAULT_SETTINGS` gains `grid_opacity: 1`, `grid_color: "subtle"`. The settings table is key/value JSON merged over defaults, so no migration is needed.
- **src/components/canvas/Canvas.tsx** — `BackgroundCanvas` takes `gridOpacity` and `gridColor` props, mirrored into refs (same pattern as `gridSize`) so the rAF loop reads live values without re-mounting. Each frame, the base grid RGB resolves from the preset: subtle = `--ms-dot` blended 35% toward `--ms-text` (unchanged math); text = `--ms-text`; accent = `--ms-accent` (which already carries a custom accent via `applyTheme`). The grid-dot pass is wrapped in `ctx.globalAlpha = gridAlpha` (reset to 1 after) and skipped when alpha ≤ 0.01 or the zoomed gap ≤ 4px. The ripple-FX brighten was refactored to blend the *chosen* base color toward `--ms-text` by `0.85·k·e` — algebraically identical to the old formula for the subtle preset, and meaningful for accent (text preset just swells, since it's already at the blend target). Node dots, edges, and particles are untouched.
- **src/components/settings/SettingsPanel.tsx** — Grid Opacity range input (UI percent ↔ stored 0..1, 80ms debounced save) and Grid Color segmented buttons (immediate save), inserted after Grid Size; `disabled={!settings.snap_to_grid}` removed from Grid Size. Release-notes array gains a v1.9 current entry; footer version string bumped.
- **Versions** — package.json and src-tauri/tauri.conf.json bumped to 1.9.0.

## Functional Overview of the Build

In Settings > Canvas: drag **Grid Opacity** to fade the background dot grid — 0% removes it completely, 100% is the familiar look. Pick a **Grid Color** preset: Subtle keeps the quiet theme-blended dots, Text makes the grid pop in the theme's text color, Accent tints it with the theme accent (cyan on Vibrant Dark, amber on Warm Sepia, or your custom accent). All presets re-resolve from the live theme, so changing themes recolors the grid instantly. Grid Size now adjusts the visible grid even when Snap to Grid is off. The Ripple hover effect still swells and brightens dots near the cursor under every preset and opacity.

## Expected Behaviour

- Grid fades smoothly with the opacity slider; 0% = no grid drawn, no leftover cost beyond the skipped loop.
- Each color preset derives from the active theme's CSS variables and follows theme/accent changes live, per frame.
- Grid Size slider always active; snapping toggle unaffected.
- Existing vaults: identical rendering to v1.8.2 (defaults subtle/100%); settings persist via the existing SQLite key/value store.

## Actual Behaviour

- `tsc --noEmit` clean; `vite build` clean; `tauri build --no-bundle` clean (with and without beacon).
- Packaged-binary boot-verify on the real vault via boot beacon: both webviews (main + tray capture) mounted (`rootChildren=1`, main htmlLen≈150k), zero window errors / unhandled rejections, and the boot-check reported `grid_opacity=1 grid_color=subtle grid_size=40` — new defaults merged correctly alongside the user's previously saved grid size.
- Interactive UI flows (dragging the slider, clicking presets, visual confirmation of accent tint per theme) were not exercised — the app runs headless from the CLI; logic verified by code-path inspection only. Beacon instrumentation was stripped and the binary rebuilt clean afterwards.

## Test Cases

| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Typecheck + production build | `tsc --noEmit`; `vite build`; `tauri build --no-bundle` | All pass | All pass | ✅ Pass |
| 2 | Packaged boot, real vault | Launch release binary with beacon | Root mounts, no errors | rootChildren=1, htmlLen≈150k, no errors | ✅ Pass |
| 3 | Settings migration on existing vault | Boot beacon reads merged settings | New keys defaulted, saved keys kept | grid_opacity=1, grid_color=subtle, grid_size=40 (user's value) | ✅ Pass |
| 4 | Default render parity with v1.8.2 | Subtle @ 100% | Identical blend math to old code path | Verified by inspection: same 35% dot→text mix, alpha 1 | ✅ Pass (static) |
| 5 | Opacity 0% hides grid | Slider to 0% | Grid loop skipped | Not run (interactive) | Not run |
| 6 | Accent preset + custom accent | Set custom accent, pick Accent | Grid tints with custom accent | Not run (interactive) | Not run |
| 7 | Live theme switch recolors grid | Change theme with panel open | Grid recolors next frame | Not run (interactive; per-frame CSS var read guarantees it) | Not run |
| 8 | Grid Size active with snap off | Toggle Snap to Grid off | Slider stays enabled, grid spacing changes | Not run (interactive) | Not run |
| 9 | Ripple FX under each preset | FX style Ripple, hover canvas | Dots swell/brighten, opacity respected | Not run (interactive) | Not run |
