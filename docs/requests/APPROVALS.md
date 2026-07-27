# Approval Ledger

Append-only record of every approval decision in this project. **Never edit or delete existing rows** — corrections get a new row. One row per decision event. The PreToolUse gate requires an `Approved` row here (matching the active plan's filename) before source edits are allowed.

Decisions: `Approved` · `Revision Requested` · `Rejected` · `Completed` · `Reopened`

| Timestamp | Request File | Decision | Approver | Notes |
|---|---|---|---|---|
| 2026-06-11T17:16:08+05:30 | 2026-06-11-phase-1-core-ux.md | Approved | mcbenaofficial | Approved with full scope (alignment toolbar, lock badge, store slicing included) via in-session prompt |
| 2026-06-11T17:18:55+05:30 | 2026-06-11-phase-0-stabilize.md | Approved | mcbenaofficial | Retroactive: approved in-session before harness install |
| 2026-06-11T17:18:55+05:30 | 2026-06-11-phase-0-stabilize.md | Completed | mcbenaofficial | Retroactive: shipped as v1.3.0 before harness install |
| 2026-06-11T17:30:20+05:30 | 2026-06-11-phase-1-core-ux.md | Completed | mcbenaofficial | Shipped as v1.4.0; live UI test pass pending |
| 2026-06-11T17:41:54+05:30 | 2026-06-11-phase-2-the-brain.md | Revision Requested | mcbenaofficial | Add daily resurfacing / journal digest to scope; plan updated (step 11) |
| 2026-06-11T17:53:43+05:30 | 2026-06-11-phase-2-the-brain.md | Approved | mcbenaofficial | Approved revised plan incl. daily digest; ship as v1.5.0 |
| 2026-06-11T18:18:41+05:30 | 2026-06-11-phase-2-the-brain.md | Completed | mcbenaofficial | Shipped as v1.5.0; live verification pending (needs LM Studio embedding model) |
| 2026-06-11T18:29:21+05:30 | 2026-06-11-no-emoji-icon-policy.md | Approved | mcbenaofficial | Direct directive: never use emojis, only react icons |
| 2026-06-11T18:43:23+05:30 | 2026-06-11-no-emoji-icon-policy.md | Completed | mcbenaofficial | Shipped as v1.5.1; emoji scan clean |
| 2026-06-11T23:09:39+05:30 | 2026-06-11-phase-3-platform.md | Approved | mcbenaofficial | Approved as planned; ship as v1.6.0 |
| 2026-06-11T23:43:12+05:30 | 2026-06-11-phase-3-platform.md | Completed | mcbenaofficial | Shipped as v1.6.0: menubar capture, node registry, rules engine + Automations UI |
| 2026-06-12T00:56:33+05:30 | 2026-06-12-fix-startup-render-loop.md | Approved | mcbenaofficial | Bug report (black screen on installed v1.6.0) treated as approval; blocking the DMG deliverable |
| 2026-06-12T00:58:14+05:30 | 2026-06-12-fix-startup-render-loop.md | Completed | mcbenaofficial | Shipped as v1.6.1; production boot verified via instrumented run before stripping debug code |
| 2026-06-12T01:13:54+05:30 | 2026-06-12-search-fix-sidebar-search-grid.md | Approved | mcbenaofficial | Approved as planned; ship as v1.6.2 |
| 2026-06-12T01:42:50+05:30 | 2026-06-12-search-fix-sidebar-search-grid.md | Completed | mcbenaofficial | Shipped as v1.6.2; index converged 111/111 on the real vault during instrumented boot |
| 2026-06-12T02:02:45+05:30 | 2026-06-12-node-fx-color-visibility.md | Approved | mcbenaofficial | Approved as planned; ship as v1.7.0 |
| 2026-06-12T05:48:11+05:30 | 2026-06-12-node-fx-color-visibility.md | Completed | mcbenaofficial | Shipped as v1.7.0; boot-verified on real vault, zero errors, index intact 111/111 |
| 2026-06-12T06:14:34+05:30 | 2026-06-12-mental-model-chat-lens.md | Approved | mcbenaofficial | Approved with 31-model resolution ("If 31, build 31"); ship as v1.8.0 |
| 2026-06-12T06:29:45+05:30 | 2026-06-12-mental-model-chat-lens.md | Completed | mcbenaofficial | Shipped as v1.8.0; packaged boot-verify on real vault: 31 models seeded (18/3/10), index intact 111/111; live LM Studio round-trip not run |
| 2026-06-12T06:56:21+05:30 | 2026-06-12-mental-model-node-type.md | Approved | mcbenaofficial | "go for it" — approved with v1.8.2 in one message; ship as v1.8.1 |
| 2026-06-12T06:56:21+05:30 | 2026-06-12-brain-ambient-model-suggestions.md | Approved | mcbenaofficial | "go for it" — approved with v1.8.1; builds only after v1.8.1 ships; ship as v1.8.2 |
| 2026-06-12T07:14:00+05:30 | 2026-06-12-mental-model-node-type.md | Completed | mcbenaofficial | Shipped as v1.8.1; packaged boot-verify on real vault: test node persisted + rendered (Asch Conformity in DOM), vault intact 112/36/31, cleaned up; interactive UI flows not run |
| 2026-06-12T08:05:00+05:30 | 2026-06-12-brain-ambient-model-suggestions.md | Completed | mcbenaofficial | Shipped as v1.8.2; packaged boot-verify: 31/31 models embedded live, idempotent on reboot, pricing probe returned Cost vs. Value vs. Price; threshold calibrated 0.72→0.68 per spec's false-negative rule (measured: relevant 0.71–0.76, noise ≤0.51); interactive UI flows not run |
| 2026-06-12T07:45:46+05:30 | 2026-06-12-grid-opacity-theme-colors.md | Approved | mcbenaofficial | "go for it"; ship as v1.9.0 |
| 2026-06-12T14:52:24+05:30 | 2026-06-12-grid-opacity-theme-colors.md | Completed | mcbenaofficial | Shipped as v1.9.0; packaged boot-verify on real vault: root mounted, no errors, defaults merged (grid_opacity=1, grid_color=subtle alongside saved grid_size=40); interactive UI flows not run |
| 2026-06-17T00:07:55+05:30 | 2026-06-16-zen-node.md | Approved | mcbenaofficial | "Approved."; full spec (6 variations + presets + timer + Automations); ship as v1.10.0; build+package+boot-verify |
| 2026-06-17T02:55:54+05:30 | 2026-06-16-zen-node.md | Completed | mcbenaofficial | Shipped as v1.10.0; packaged boot-verify: app boots, zen registered (category time, 35 types), all 6 variations, audioCtxAtBoot=none (gesture-gated), defaults pendulum/0.55 paused; beacon stripped + clean DMG staged to ~/Downloads; interactive audio/visual/timer/preset/network flows not run headlessly |
| 2026-07-28T01:14:21+05:30 | 2026-07-28-public-repo-privacy-audit.md | Approved | mcbenaofficial | "Approved."; purge AUDIT-2026-06.md and personal name/email from all git history via filter-repo + force-push, redact future ledger rows to GitHub handle only, rewrite README for public visitors |
| 2026-07-28T01:27:25+05:30 | 2026-07-28-public-repo-privacy-audit.md | Completed | mcbenaofficial | Shipped as v1.10.1; AUDIT-2026-06.md and personal name/email purged from all git history via two git-filter-repo passes, force-pushed and verified against origin/main; README expanded; approver identity in this ledger now uses the GitHub handle going forward |
