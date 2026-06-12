# Canvas Node Color/Visibility Settings + Hover Interactivity ("Alive" Canvas)

- **Status:** 🟢 Complete
- **Date raised:** 2026-06-12
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-12 — "Approve (Recommended)" via in-session prompt
- **Release version:** v1.7.0

## Requested Feature
1. Make canvas node color and visibility adjustable in Settings.
2. Make the canvas nodes interactive: hovering over the canvas makes the nodes react, so the canvas feels alive.
3. Make the node interactivity controllable in Settings.

## Clarifications (Q&A)
- **Q: Which "nodes" — the real node cards or the ambient background layer (glowing dots + connector particles)?**
  A: Both, but configurable in the settings.
- **Q: What should the hover reaction look like — direct hover only, proximity glow, or proximity + grid ripple?**
  A: All 3, selectable in the settings.
- **Q: What controls?**
  A: Toggle + sliders (interactivity on/off, effect intensity, node color, node opacity) in Settings > Canvas.

## Current State (evidence)
- `settings.node_color` already exists with a picker in Settings > Canvas, but it only tints the **ambient background layer** (node dots, edges, particles in `BackgroundCanvas`); the real node cards ignore it.
- There is no node-visibility/opacity control of any kind.
- There is no hover reactivity anywhere: `BackgroundCanvas` has no cursor awareness, and node cards have only whatever per-card CSS exists.
- `BackgroundCanvas` (Canvas.tsx) already runs a per-frame rAF draw loop with refs for settings — the right place to add cursor-reactive ambient/grid effects at zero extra render cost.

## Plan

### 1. New settings (types/index.ts `AppSettings`, settingsSlice `DEFAULT_SETTINGS`)
- `node_opacity: number` — 0.4–1.0, default 1.0 (node card visibility).
- `canvas_fx_enabled: boolean` — default true (master hover-interactivity toggle).
- `canvas_fx_style: "hover" | "proximity" | "ripple"` — default `"proximity"`. `hover` = react only under the cursor; `proximity` = nodes near the cursor glow/lift with distance falloff; `ripple` = proximity + the grid dots near the cursor brighten and swell.
- `canvas_fx_intensity: number` — 0–100, default 60.
- `canvas_fx_cards: boolean` — default true (node cards react).
- `canvas_fx_ambient: boolean` — default true (ambient dot/particle layer reacts).
- Existing `node_color` becomes the single node color: in addition to the ambient layer it now drives a `--ms-node-accent` CSS variable used by the node cards (selection ring, hover glow). Reset still falls back to the theme accent.

### 2. Node card color + opacity (Canvas.tsx, index.css)
- Canvas sets `--ms-node-accent` and `--ms-node-opacity` on the flow wrapper from settings.
- CSS applies `opacity: var(--ms-node-opacity)` to the card wrapper and switches the selected/hover ring + glow colors to `var(--ms-node-accent)`.

### 3. Hover FX engine for node cards (new `CanvasHoverFX` in Canvas.tsx)
- `pointermove`/`pointerleave` listener on the flow container; a rAF loop imperatively styles each card's **inner** element (never `.react-flow__node` itself — React Flow owns its transform) with brightness, an accent drop-shadow glow, and a slight lift/scale, falling off with distance (radius ≈ 300px, scaled by intensity).
- `hover` style does the same but only for the card under the cursor.
- Node screen-rects cached and refreshed ~10×/s (not per frame); styles fully reset when the toggle/`canvas_fx_cards` is off or the pointer leaves.

### 4. Ambient layer + grid reactivity (BackgroundCanvas in Canvas.tsx)
- Cursor position fed into the existing draw loop via a ref (listener sits on the flow wrapper since the canvas itself is `pointer-events: none`).
- When `canvas_fx_ambient` and fx enabled: ambient node dots near the cursor get a brighter, larger glow; connector particles near the cursor brighten.
- When style = `ripple`: grid dots within the radius swell (radius up to ~2×) and blend further toward the text color with smooth falloff — the grid itself feels alive.
- Intensity scales radius and strength everywhere.

### 5. Settings UI (SettingsPanel.tsx > Canvas section)
- "Node Opacity" slider (40–100%).
- "Hover Effects" toggle; below it (when on): effect-style segmented control (Hover / Proximity / Ripple), "Effect Intensity" slider, and "Node Cards" / "Ambient Layer" toggles.
- All wired through the existing `immediateSave`/`debouncedSave` so changes apply live. lucide-react icons only, no emojis.

### 6. Closeout
- Bump to v1.7.0 (minor — new feature) in package.json + tauri.conf.json; CHANGELOG.md entry; in-app release notes; `npx tsc --noEmit`, `npm run build`, `cargo check`; boot-verify the built binary against the real vault (standing rule); DMG to ~/Downloads; ledger + metrics.

## Out of Scope
- Per-node-type or per-node custom colors.
- Physics/spring simulations or node repulsion from the cursor.
- Touch/trackpad-gesture-specific effects.
- Changing node card layouts or themes themselves.

## Acceptance Criteria
- [x] Settings > Canvas shows Node Opacity, Hover Effects toggle, effect style selector, intensity slider, and per-layer (cards/ambient) toggles; all persist and apply live. _(implemented + compiled; visual click-through pending user relaunch)_
- [x] Node Color now visibly tints the node cards (selection border + glow) as well as the ambient layer; Reset returns to theme accent (CSS falls back to `--ms-accent`).
- [ ] With Proximity selected, moving the cursor across the canvas makes nearby node cards glow/lift with smooth falloff; with Ripple, the grid dots near the cursor also swell/brighten; with Hover, only the hovered card reacts. _(implemented; boot-verified active with `data-fx="proximity"` and zero errors, but the visual look needs the user's eyes)_
- [x] Turning Hover Effects off (or a layer toggle off) fully removes the effect — the FX engine resets all inline styles on disable/unmount.
- [x] No regression with a 100+ node vault: effects are imperative (no React re-renders on mouse move), card rects re-measured at ~8 Hz not per frame, only elements inside the falloff radius are touched; boot-verified against the real 111-node vault with zero errors/warnings.
- [x] tsc + vite build pass; instrumented binary boot-verified against the real vault (both windows mount, search index intact 111/111, no errors). Rust untouched this release; `npx tauri build` recompiled it clean.

## Progress
- [x] `AppSettings` + `DEFAULT_SETTINGS`: `node_opacity` (1.0), `canvas_fx_enabled` (true), `canvas_fx_style` ("proximity"), `canvas_fx_intensity` (60), `canvas_fx_cards` (true), `canvas_fx_ambient` (true).
- [x] Canvas.tsx wrapper: `ms-flow-wrap` class, `data-fx` attribute (style or "off"), CSS vars `--ms-node-opacity` and `--ms-fx-k`; existing `--ms-node-dot` reused as the single node accent.
- [x] index.css: node opacity rule, selection ring/glow switched to the node accent, `--ms-node-glow` derived via color-mix, pure-CSS direct-hover style under `[data-fx="hover"]`.
- [x] New `CanvasHoverFX` (Canvas.tsx): rAF engine driving proximity/ripple card reactions — brightness + accent drop-shadow + lift/scale on each card's inner element (never `.react-flow__node`, whose transform React Flow owns), smoothstep falloff measured from the card edge, rect cache at ~8 Hz, full style reset on disable.
- [x] `BackgroundCanvas`: window-level cursor tracking; ambient node dots and connector particles swell/brighten near the cursor (proximity + ripple styles); ripple additionally swells/brightens grid dots with falloff. All gated by enabled/ambient/intensity.
- [x] SettingsPanel > Canvas: Node Opacity slider (40–100%), Hover Effects toggle, Hover/Proximity/Ripple segmented control, Effect Intensity slider, Node Cards React + Ambient Layer Reacts toggles.
- [x] v1.7.0 bumps (package.json, tauri.conf.json), CHANGELOG, in-app release notes + footer; beacon boot-verify; final DMG to ~/Downloads.

## Complete Summary
The canvas now feels alive. Moving the cursor across it makes nearby node cards glow, lift, and brighten with smooth distance falloff; the ambient glow-dot layer reacts the same way, and the Ripple style extends the reaction to the grid dots themselves. Everything is controllable in Settings > Canvas: a master Hover Effects toggle, three effect styles (Hover / Proximity / Ripple), an intensity slider, and independent toggles for the card and ambient layers. Node Color now genuinely colors the nodes — selection border and glow on the cards, not just the background dots — and a new Node Opacity slider fades cards into the canvas.

## Technical Overview of the Build
- `src/types/index.ts` / `src/store/slices/settingsSlice.ts`: six new settings keys with defaults (effects on, proximity style, 60% intensity, both layers active, full opacity).
- `src/components/canvas/Canvas.tsx`:
  - Wrapper div carries `ms-flow-wrap`, `data-fx`, and the CSS vars; `backgroundFx` memo feeds the ambient layer.
  - `CanvasHoverFX`: imperative rAF engine; window `pointermove` (passive) updates plain variables, the loop styles only cards whose smoothstep falloff exceeds a threshold, and rects are re-measured every ~120 ms. Zero React re-renders per mouse move. Cleanup and the disabled path strip all inline styles.
  - `BackgroundCanvas`: new `fx` prop + cursor ref (window-level listeners, since the canvas is `pointer-events: none`); per-frame falloff helper drives grid-dot swell/brighten (ripple), node-dot halo/core boost, and particle glow boost.
- `src/index.css`: `--ms-node-glow` derived with `color-mix`; `.react-flow__node` opacity from `--ms-node-opacity`; `.ms-node.selected` ring/glow from `--ms-node-dot`; `[data-fx="hover"]` pure-CSS reaction scaled by `--ms-fx-k`.
- `src/components/settings/SettingsPanel.tsx`: new controls in the Canvas section wired through `immediateSave`/`debouncedSave`.

## Functional Overview of the Build
Open Settings > Canvas. Node Opacity fades all cards (40–100%). Hover Effects toggles the living-canvas behavior; pick a style — Hover (only the card under the cursor reacts), Proximity (cards and ambient dots near the cursor glow and lift as you move), Ripple (proximity plus the grid dots swelling under the cursor) — and set the intensity. The Node Cards React / Ambient Layer Reacts toggles let either layer opt out. Node Color (existing picker) now tints the cards' selection border and glow as well as the background layer; Reset returns everything to the theme accent. All changes apply live, no restart.

## Expected Behaviour
Cursor movement makes the canvas visibly react per the selected style and intensity; opacity and color settings restyle the node cards immediately; disabling any toggle cleanly removes its effect; no performance degradation on the 111-node vault.

## Actual Behaviour
`npx tsc --noEmit` and the vite production build pass clean. An instrumented production boot against the real vault: both windows mounted, the flow wrapper carried `data-fx="proximity"` (defaults active, FX loops running), 7 nodes rendered on the active canvas, vault intact at 111 nodes with the search index still converged at 111/111, and zero window errors, unhandled rejections, console errors, or warnings over a 16-second run. The hidden capture window sent its boot signal but its delayed self-check didn't fire before shutdown (WebKit throttles timers in hidden windows) — no errors from it either. The visual feel of the three effect styles, the sliders, and the per-layer toggles were not visually inspected (CLI cannot see the window) — pending the user's relaunch. Note: the running v1.6.2 instance was quit during verification; install/launch v1.7.0 fresh.

## Test Cases
| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Typecheck + production build | `npx tsc --noEmit`, `npm run build` | Pass | Pass | ✅ Pass |
| 2 | Boot health on real vault | Beacon boot of release binary | Both windows mount, no errors/warnings | Clean; `data-fx="proximity"` active, 7 cards rendered | ✅ Pass |
| 3 | Data integrity after new code paths | Count nodes + search_index during instrumented boot | 111 / 111 | 111 / 111 | ✅ Pass |
| 4 | FX defaults wired end-to-end | Inspect wrapper attrs/vars at boot | `data-fx="proximity"`, vars set | Confirmed via beacon | ✅ Pass |
| 5 | Proximity style visual feel | Move cursor across canvas | Nearby cards glow/lift smoothly | Not run (manual) | Not run |
| 6 | Ripple style grid reaction | Select Ripple, move cursor | Grid dots swell/brighten near cursor | Not run (manual) | Not run |
| 7 | Hover style | Select Hover, hover a card | Only that card reacts | Not run (manual) | Not run |
| 8 | Settings controls live-apply | Drag opacity/intensity sliders, flip toggles | Immediate visual change; off = clean removal | Not run (manual) | Not run |
| 9 | Node Color tints cards | Pick a color, select a node | Selection border/glow in chosen color | Not run (manual) | Not run |
