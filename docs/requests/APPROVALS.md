# Approval Ledger

Append-only record of every approval decision in this project. **Never edit or delete existing rows** — corrections get a new row. One row per decision event. The PreToolUse gate requires an `Approved` row here (matching the active plan's filename) before source edits are allowed.

Decisions: `Approved` · `Revision Requested` · `Rejected` · `Completed` · `Reopened`

| Timestamp | Request File | Decision | Approver | Notes |
|---|---|---|---|---|
| 2026-06-11T17:16:08+05:30 | 2026-06-11-phase-1-core-ux.md | Approved | mcbenaofficial | Approved with full scope (alignment toolbar, lock badge, store slicing included) via in-session prompt |
| 2026-06-11T17:18:55+05:30 | 2026-06-11-phase-0-stabilize.md | Approved | mcbenaofficial | Retroactive: approved in-session before harness install |
| 2026-06-11T17:18:55+05:30 | 2026-06-11-phase-0-stabilize.md | Completed | mcbenaofficial | Retroactive: shipped as v1.3.0 before harness install |
