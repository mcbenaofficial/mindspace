# Fix — Black Screen at Startup (Infinite Render Loop in Canvas)

- **Status:** 🟢 Complete
- **Date raised:** 2026-06-12
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-12 — direct user bug report while requesting the production DMG ("I just see a blank screen once I've installed the app"); fix required to deliver the already-approved v1.6.0 build, treated as approval per the no-emoji-policy precedent
- **Release version:** v1.6.1

## Requested Feature
The freshly installed v1.6.0 production app showed only a black window. Diagnose and fix so the DMG is usable, retaining all existing user data.

## Clarifications (Q&A)
None — unambiguous bug report with a screenshot. Notable finding during diagnosis: the bug was NOT production-specific; dev mode crashed identically. v1.6.0 was the first time the app was launched at all after the Phase 3 build (Phase 3 closed with tsc/build/cargo checks only), so the regression went unnoticed.

## Plan
1. Instrument the app with a temporary "boot beacon" (startup/error events POSTed via the existing `http_post` command to a local listener) since the packaged WKWebView console is not accessible from the CLI.
2. Identify the crash, find the root cause, fix it minimally.
3. Remove all instrumentation, bump to v1.6.1, rebuild and verify the DMG.

## Out of Scope
- Code signing / notarization of the DMG (ad-hoc signed; fine for personal use).
- The remaining manual test cases from v1.3.0–v1.6.0 (still need a human pass in the running app).

## Acceptance Criteria
- [x] Root cause identified with evidence (not a speculative fix).
- [x] Production binary boots and renders the full UI (verified via instrumented run: main window root mounted, ~140 KB DOM, no errors; capture window mounts).
- [x] All debug instrumentation removed from the shipped code.
- [x] tsc + vite build + cargo check pass; fresh DMG produced as v1.6.1.
- [x] User data untouched (fix is frontend-only; DB backed up to `backups/mindspace-pre-v1.6.0-dmg.db` beforehand).

## Progress
- [x] Beacon instrumentation (temp code in main.tsx + a local Python listener) captured the crash: **React error #185 — Maximum update depth exceeded**; React unmounts the root, and with a transparent window an empty page renders as black.
- [x] Reproduced in dev mode with full diagnostics (`onUncaughtError` component stack): the loop is in React Flow's internal `StoreUpdater` under `CanvasInner`.
- [x] A per-render store-diff tracer showed the loop begins the instant nodes load onto the active canvas and continues with zero app-store changes — pointing at local state churn.
- [x] Root cause: `onSelectionChange={({ nodes }) => setSelectedIds(nodes.map(n => n.id))}` in Canvas.tsx — an inline handler (new identity every render) that always sets a new array (`[] !== []` even when selection is unchanged). React Flow re-fires selection handlers when their identity changes, so: fire → setState(new array) → re-render → new handler identity → fire… Infinite once any node exists, which is why an empty-DB browser test passed while the real vault crashed.
- [x] Fix: stable `useCallback` handler with a same-array bail-out (returns `prev` when ids are unchanged, so React skips the re-render). Also hoisted the inline `fitViewOptions` object and `snapGrid` array to stable identities (both are React Flow store-synced props; they caused store churn on every render).
- [x] Verified in dev (boot-check: root mounted, renders settle) and in the production build (boot-check: root mounted, 140 KB DOM, both windows healthy).
- [x] Instrumentation fully removed (main.tsx restored, tracer deleted from Canvas.tsx, `keepNames` removed from vite.config.ts); tsc clean; v1.6.1 DMG built.

## Complete Summary
The v1.6.0 black screen was an infinite React render loop in the canvas that fired as soon as real data loaded. One unstable callback prop to React Flow was the cause. Fixed with a stable, bail-out-capable selection handler plus two prop-identity hygiene fixes, shipped as v1.6.1.

## Technical Overview of the Build
- Canvas.tsx: `handleSelectionChange` is now a `useCallback` that compares the incoming selection ids against the previous array and returns the same reference when unchanged (React bails out of the update). `FIT_VIEW_OPTIONS` hoisted to a module constant; `snapGrid` memoized on `settings.grid_size`.
- Diagnosis infrastructure (all removed before release): beacon error-reporting in main.tsx via `invoke("http_post")` to a localhost listener; React 19 `onUncaughtError` for component stacks; a CanvasInner render tracer diffing store snapshots; `esbuild.keepNames` in vite.config.ts.

## Functional Overview of the Build
The installed app now opens to the normal UI with all existing projects, canvases, and nodes. No user-facing behavior changes beyond the fix.

## Expected Behaviour
App boots to the full canvas UI in both dev and production with any amount of data.

## Actual Behaviour
Instrumented production run: main window mounts (root children present, ~140 KB DOM), capture window mounts, no uncaught errors, render count settles. Final shipped binary is identical minus passive debug code. Visual confirmation on the user's screen pending their relaunch.

## Test Cases
| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Production boot with real vault | Launch release binary, beacon boot-check | Root mounted, no errors | rootChildren=1, htmlLen≈140k, no errors | ✅ Pass |
| 2 | Dev boot with real vault | tauri dev, beacon boot-check | Root mounted, renders settle | rootChildren=1, renders settle | ✅ Pass |
| 3 | Loop regression guard | Select/deselect nodes repeatedly | No update-depth error | Not run (needs manual UI pass) | Not run |
| 4 | tsc / build / cargo | run all | Pass | All pass | ✅ Pass |
| 5 | Data retention | Open installed v1.6.1 over existing data | All projects/nodes present | Not run (user to confirm visually) | Not run |
