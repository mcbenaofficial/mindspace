
<!-- RISERVE_HARNESS_START -->
## Feature Workflow (mandatory — RiServe harness)

Every feature request, enhancement, bug fix, or change request MUST go through the `feature-workflow` skill (in `.claude/skills/feature-workflow/`) BEFORE any code is written:

1. Ask clarifying questions until requirements are complete.
2. Write a plan to `docs/requests/YYYY-MM-DD-<slug>.md` with status 🟡 Awaiting Approval.
3. STOP and wait for explicit user approval. On approval, set status `🔵 In Progress` AND append an `Approved` row (timestamp via `date -Iseconds`, approver via `git config user.name`/`user.email`) to the append-only ledger `docs/requests/APPROVALS.md`. A PreToolUse hook blocks all source edits until BOTH exist — never write either without the user's approval message. Record `Revision Requested`/`Rejected` rows likewise.
4. Implement, keeping a progress checklist in the plan file.
5. On completion set status 🟢 Complete and append: complete summary, technical overview, functional overview, expected behaviour, actual behaviour (truthful), and a test-case table.
6. Add a semver-versioned entry to root `CHANGELOG.md` linking the request file, and bump the project manifest version to match.
7. Append a `Completed` row to `APPROVALS.md` and regenerate the metrics dashboard: `python3 .claude/harness-metrics.py` (writes `docs/requests/METRICS.md`). Never edit ledger rows or METRICS.md by hand.

At the end of each week (or when asked), run the `weekly-report` skill: it generates `docs/reports/<YYYY>-W<ww>.md` (code changes, deployments, approval activity, quality scores) and you fill in the mistakes/lessons/repeated-mistakes/improvements sections honestly, comparing against previous weeks.
<!-- RISERVE_HARNESS_END -->
