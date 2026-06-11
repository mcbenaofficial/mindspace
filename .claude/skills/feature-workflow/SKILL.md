---
name: feature-workflow
description: Structured request-to-delivery workflow. Use whenever the user raises a feature request, enhancement, bug fix, or change request. Gathers complete requirements via clarifying questions, writes a plan to a .md file, waits for approval, then implements and updates the same file with progress, summary, technical/functional overviews, expected vs actual behavior, and test cases.
---

# Feature Workflow

A two-phase workflow for every feature request, enhancement, or fix: **Plan → Approve → Build → Document**. One markdown file per request is the single source of truth from intake to delivery.

## Phase 1 — Intake & Plan

1. **Gather complete information.** Before planning, use the AskUserQuestion tool (or direct questions) to resolve anything ambiguous:
   - What exactly is being requested? What problem does it solve?
   - Scope boundaries — what is explicitly in and out of scope?
   - Affected areas of the codebase, integrations, or data.
   - Constraints: backward compatibility, performance, UI/UX expectations, deadlines.
   - Acceptance criteria — how will the user know it's done?

   Ask only questions you cannot answer yourself from the codebase. Investigate the code first (codegraph/search), then ask what remains. Batch questions; don't drip-feed them.

2. **Create the plan file.** Write it to `docs/requests/YYYY-MM-DD-<short-slug>.md` in the project root (create the directory if needed; if the project has an established plans/docs location, use that instead). Use this structure:

   ```markdown
   # <Request Title>

   - **Status:** 🟡 Awaiting Approval
   - **Date raised:** <date>
   - **Requested by:** <user>
   - **Release version:** <assigned on completion, e.g. v1.3.0>

   ## Requested Feature
   <Verbatim-faithful description of what was asked, plus the clarified requirements from Q&A.>

   ## Clarifications (Q&A)
   <Each question asked and the answer given.>

   ## Plan
   <Numbered implementation steps, files to be touched, approach, and any trade-offs/decisions.>

   ## Out of Scope
   <Explicitly excluded items.>

   ## Acceptance Criteria
   <Checklist of measurable outcomes.>
   ```

3. **Stop and request approval.** Present the plan summary to the user and wait. Do NOT begin implementation until the user explicitly approves. If they request changes, revise the plan file and re-confirm.

## Phase 2 — Build & Document

On approval:

1. **Record the approval — two signals, both required by the PreToolUse gate:**
   - Update **Status** to `🔵 In Progress` and add an approval line (`**Approved:** <date>`). Write the literal string `Status:** 🔵 In Progress` exactly.
   - Append a row to `docs/requests/APPROVALS.md` (the append-only approval ledger; create it from the harness template if missing). Get the timestamp via `date -Iseconds` and the approver identity via `git config user.name` and `git config user.email` (fall back to `$USER`):

     ```markdown
     | 2026-06-11T17:30:00+05:30 | 2026-06-11-<slug>.md | Approved | Name <email> | <optional note> |
     ```

   Record `Revision Requested` or `Rejected` rows the same way when the user pushes back. NEVER append an `Approved` row without an explicit approval message from the user in this conversation — the ledger exists to audit faulty approvals.
2. Implement the plan. As each major step completes, update a **Progress** section in the file:

   ```markdown
   ## Progress
   - [x] Step 1 — <what was done> (<file paths touched>)
   - [ ] Step 2 — ...
   ```

3. When implementation is complete and verified, set **Status** to `🟢 Complete` and append the delivery report to the same file:

   ```markdown
   ## Complete Summary
   <Plain-language wrap-up of everything delivered.>

   ## Technical Overview of the Build
   <Architecture/code-level explanation: files changed, new modules, data flow, key decisions, dependencies added.>

   ## Functional Overview of the Build
   <User-facing explanation: what the user can now do, how to use it, UI/UX changes.>

   ## Expected Behaviour
   <What should happen, per the requirements and acceptance criteria.>

   ## Actual Behaviour
   <What was observed when running/testing the build. Be honest — note any deviations, known issues, or untested paths.>

   ## Test Cases
   | # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
   |---|----------|-------|-----------------|---------------|-----------|
   <One row per test case. Include edge cases. Run the tests where possible; mark untested cases as "Not run".>
   ```

4. **Update the release notes.** Maintain a `CHANGELOG.md` at the project root (create it on first use). On every completed request:
   - Determine the new version with semantic versioning: **patch** (x.y.Z) for bug fixes, **minor** (x.Y.0) for new features/enhancements, **major** (X.0.0) for breaking changes. Read the current version from `CHANGELOG.md` or the project manifest (`package.json`, `Cargo.toml`, `tauri.conf.json`, etc.); if the manifest carries a version, bump it there too so they stay in sync.
   - Prepend an entry (newest first):

     ```markdown
     ## [v1.3.0] — 2026-06-11

     ### Added | Fixed | Changed
     - <One line per change, user-facing wording.> ([request file](docs/requests/2026-06-11-<slug>.md))
     ```

   - Record the assigned version in the request file's **Release version** field.

5. **Close the audit trail and refresh metrics.** Append a `Completed` row to `docs/requests/APPROVALS.md` (same format, decision `Completed`), then regenerate the metrics dashboard: `python3 .claude/harness-metrics.py` (writes `docs/requests/METRICS.md` — lead times, test pass rates, and integrity flags).

6. Report completion to the user with the request file path, the new version number, and a brief summary.

## Multi-repo products (propagation)

Check for `.claude/propagation.json`. If present, this repo is part of a multi-repo product and these rules apply on top of everything above:

- **`"role": "origin"`** (e.g. riserve-v9 — the internal fast-build repo): when a request completes, add a `## Propagation` section to its request file declaring where the feature must be built out, using the configured `targets` (omit targets the feature genuinely doesn't apply to, and say why in the plan):

  ```markdown
  ## Propagation
  | Target Repo | Status | Downstream Request |
  |---|---|---|
  | riserve-captain-app | Pending | — |
  | ri-flow-alembic | Pending | — |
  ```

  Update a row to `Landed` (with a link in the third column) only when the downstream repo's request file is Complete. Statuses: `Pending` → `In build` → `Landed`, or `N/A — <reason>`.

- **`"role": "target"`** (the production repos): every plan that builds out a feature from the origin repo MUST carry an `- **Origin:** <origin-repo>/docs/requests/<file>.md` line in its header block. The propagation matrix cross-references this line — without it the build is invisible to the product-level view. Work native to this repo (no origin feature) simply omits the line.

The cross-repo matrix is generated by `propagation-status.py` in the harness kit (run via `report-all.sh`); it flags features declared Landed without a verified downstream request, completed origin features with no downstream activity after 14 days, and Origin lines pointing at missing files.

## Rules

- **Never skip the approval gate.** Plan first, build only after explicit approval.
- **One file per request**, updated in place across both phases — never scatter the record across multiple files.
- **Actual Behaviour must reflect reality.** If tests fail or something is unverified, record that truthfully; never paper over gaps.
- If a request is trivially small (e.g., a typo fix), still ask the user whether they want the full workflow or a direct fix.
- If implementation deviates from the approved plan, record the deviation and the reason in the Progress section.
- **Every completed request gets a CHANGELOG.md entry with a version number** — no silent releases. If several requests ship together, they may share one version, each listed as its own bullet.
- If the project already has an established changelog or release-notes location (e.g., release logs in an app settings screen), update that too, keeping `CHANGELOG.md` as the canonical source.
- **The approval ledger is append-only.** Never edit, reorder, or delete existing rows in `APPROVALS.md`; corrections get a new row (e.g., `Reopened`). Never write `METRICS.md` by hand — always regenerate it with the script.
