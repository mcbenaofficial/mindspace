# No-Emoji Policy — Replace All Emojis with lucide-react Icons

- **Status:** 🟢 Complete
- **Date raised:** 2026-06-11
- **Requested by:** mcbenaofficial
- **Approved:** 2026-06-11 — direct user directive: "never use emojis in our project, use only react icons" (treated as approval; no open questions)
- **Release version:** v1.5.1

## Requested Feature
Remove every emoji from the project's UI, CSS, data seeds, and release notes; render lucide-react icons instead. Standing convention for all future work.

## Clarifications (Q&A)
None needed — unambiguous directive. Interpretation notes:
- Typographic symbols stay: keyboard glyphs (⌘ ⇧), arrows in comments, ellipses. The directive targets emoji pictographs and icon-like glyphs in UI.
- RiServe harness status markers (🟡🔵🟢) in docs/requests are part of the mandated workflow format and are unchanged.

## Plan
1. Lock badge: drop the CSS `content: "🔒"` rule; render a `<Lock>` chip from the `withNodeBoundary` wrapper (covers all 33 node types).
2. WeatherNode: WMO emoji map → lucide weather icons (Sun/CloudSun/Cloud/CloudFog/CloudDrizzle/CloudRain/Snowflake/CloudLightning/Thermometer).
3. CurrencyNode: remove flag emojis; plain currency-code badge.
4. HabitTracker: 🔥 → `<Flame>`, ✓ → `<Check>`.
5. CountdownNode: 🎉 → `<PartyPopper>`.
6. NodePicker: remove unused emoji field from CATEGORIES.
7. NodeEditorModal: 📄 fallback icon → `<FileText>`.
8. Inbox project: "📥 Inbox" → "Inbox" (lookup tolerant of the old name for existing vaults).
9. TodayPanel ✓ → `<Check>`; VideoNode ✕ → `<X>`; SettingsPanel "✓ Connected"/"✗ Failed" → plain words; release-note 🧠 wording → "the Brain icon".
10. CHANGELOG wording cleanup; v1.5.1 bump; verify.

## Out of Scope
- Harness status emojis in docs/requests files.

## Acceptance Criteria
- [ ] `grep` for emoji ranges in src/ returns no pictographic emojis.
- [ ] Locked nodes still show a visible lock badge (now an icon).
- [ ] Weather, currency, habit, countdown nodes render icons instead of emojis.
- [ ] Existing "📥 Inbox" vaults keep working (lookup matches old name).
- [ ] tsc + vite build pass clean.

## Progress
- [x] Steps 1–10 all complete (single pass).

## Complete Summary
Every emoji in the app's UI, CSS, and seed data is replaced with a lucide-react icon; the no-emoji rule is recorded as a standing convention (also saved to assistant memory so future work follows it automatically).

## Technical Overview of the Build
- Lock badge moved from CSS `content:"🔒"` to a `<Lock>` chip rendered by `withNodeBoundary` (NodeErrorBoundary.tsx) — covers all 33 node types with zero per-component edits; the `.ms-node-locked` CSS block removed.
- WeatherNode: `WMO_EMOJI` map → `WMO_ICON` map of lucide components (Sun/CloudSun/Cloud/CloudFog/CloudDrizzle/CloudRain/Snowflake/CloudLightning), `Thermometer` fallback, rendered at 44px in accent color.
- CurrencyNode: flag-emoji map removed; `ALL_CURRENCIES` is now a plain code list; rows show a styled currency-code badge.
- HabitTracker: `<Flame>` streak header, `<Check>` in cells. CountdownNode: `<PartyPopper>`. VideoNode: `<X>` close. TodayPanel: `<Check>`. NodeEditorModal: `<FileText>` fallback meta icon, `<Quote>` blockquote toolbar button. NodePicker: unused emoji field removed. SettingsPanel: "✓/✗" status strings → plain words; release-note wording de-emojied.
- Inbox system project renamed "Inbox"; `ensureInbox` lookup matches both 'Inbox' and the legacy '📥 Inbox' so existing vaults keep their inbox (the one remaining emoji literal in src/, inside a SQL compat string, is intentional and non-rendered).

## Functional Overview of the Build
Identical features, consistent vector iconography everywhere — weather conditions, currency rows, habit streaks, lock badges, countdown celebration, and checkmarks all render lucide icons that follow the theme colors.

## Expected Behaviour
No emoji renders anywhere in the app; locked nodes still show a badge; existing Inbox vaults unaffected.

## Actual Behaviour
Emoji scan of src/ returns only the intentional legacy-name SQL string; `tsc` and `npm run build` pass clean. Visual pass in the running app not performed this session.

## Test Cases
| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Emoji scan | grep emoji ranges over src/ | Only the legacy-Inbox SQL compat string | As expected | ✅ Pass |
| 2 | Lock badge | Lock a node | Lock icon chip at top-left corner | Not run | Not run |
| 3 | Weather icons | Open weather node with data | Vector icon matches condition | Not run | Not run |
| 4 | Currency rows | Open currency node | Code badges, no flags | Not run | Not run |
| 5 | Legacy inbox | Vault with "📥 Inbox" project | Reused, not duplicated | Not run | Not run |
| 6 | tsc / build | run both | Pass | All pass | ✅ Pass |
