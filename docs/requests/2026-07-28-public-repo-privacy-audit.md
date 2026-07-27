# Public Repo Privacy & Onboarding Audit

- **Status:** 🟢 Complete
- **Date raised:** 2026-07-28
- **Requested by:** mcbenaofficial
- **Release version:** v1.10.1
- **Approved:** 2026-07-28

## Requested Feature

Audit the MindSpace repo (public at https://github.com/mcbenaofficial/mindspace) for anything that shouldn't be visible on a public repo, gitignore it going forward, and check whether anything already tracked exposes sensitive information. Also improve `README.md` so a new visitor/contributor can understand the project.

## Clarifications (Q&A)

**Q: The repo is confirmed already fully pushed to GitHub (local `main` == `origin/main`). Two tracked files expose real problems:**
1. `AUDIT-2026-06.md` — a full security audit of *currently unpatched* vulnerabilities with exact file/line references: CSP disabled (`"csp": null"` → XSS can invoke Tauri commands), an SSRF-capable `http_post`/`http_get` Tauri command that also carries API keys, and the OpenRouter API key stored in plaintext in SQLite settings. Public and indexable right now.
2. `docs/requests/APPROVALS.md`, `METRICS.md`, `docs/reports/2026-W24.md`, and two request docs — your real name and personal Gmail address (`mcbenaofficial`) appear dozens of times.

**Q: How should the already-published git history be handled?**
A: **Rewrite history and force-push.** Purge the offending files/strings from every commit (not just add-and-remove in a new commit), then force-push so GitHub no longer serves the old blobs. This will change every commit SHA in the repo.

**Q: What happens to `AUDIT-2026-06.md` itself?**
A: **Delete it from the repo entirely**, including from history. A local-only copy will be left on disk (gitignored) so you don't lose the analysis.

**Q: What replaces the name/email in future approval-ledger rows?**
A: **GitHub username only** — `mcbenaofficial`, no real name, no email address, in all future `APPROVALS.md` / `METRICS.md` / report rows.

## Plan

### 1. Rewrite git history (destructive — confirmed above)
- Install `git-filter-repo` via Homebrew (not currently installed).
- Run `git filter-repo` to:
  - Delete `AUDIT-2026-06.md` from every commit.
  - Replace the literal string `mcbenaofficial` (and the bare `mcbenaofficial` / `mcbenaofficial` variants found in `2026-06-16-zen-node.md`) with `mcbenaofficial` across every commit, in every file it appears in (`APPROVALS.md`, `METRICS.md`, `docs/reports/2026-W24.md`, `2026-06-12-brain-ambient-model-suggestions.md`, `2026-06-12-mental-model-node-type.md`, `2026-06-16-zen-node.md`).
- Force-push the rewritten `main` to `origin`. **This requires your explicit go-ahead at execution time** — it's irreversible for anyone who doesn't have a copy of the current history, and collaborators (if any) will need to re-clone.
- Save a local, gitignored copy of `AUDIT-2026-06.md` (e.g. `.local/AUDIT-2026-06.md`) before deleting it from tracking, so the analysis isn't lost.

### 2. Update `.gitignore` for future-proofing
Add rules to prevent similar exposure going forward:
- `.local/` (private scratch notes, kept out of the repo)
- `*.sqlite`, `*.sqlite3`, `*.db` at the app-data level if any local dev DB files ever land in the repo root (the app's real data lives outside the repo, in the OS app-data dir, so this is a safety net, not a current leak)
- Confirm existing rules already cover `node_modules/`, `dist/`, `src-tauri/target/`, `.env*`, `*.key`, `*.pem`, `.codegraph/*.db*` (all verified already ignored/untracked — no change needed there).

### 3. Fix the approval-ledger template going forward
- Update `.claude/skills/feature-workflow/SKILL.md`'s approver instructions (and this project's `CLAUDE.md` harness block if it duplicates the instruction) so future `APPROVALS.md` rows use `git config user.name` translated to the GitHub handle `mcbenaofficial` instead of raw `git config user.name`/`user.email`.

### 4. Rewrite `README.md` for public visitors
Keep the existing structure (it's already solid) but add what's missing for a stranger landing on the repo:
- A short "Status" note (active solo project, pre-1.0-in-spirit desktop app).
- A **Project structure** section pointing at `src/components/nodes` (node types), `src/lib` (core logic incl. `db.ts`, `brain/`), `src-tauri` (Rust backend).
- A **Known limitations** section — a *sanitized*, non-exploitable summary of the current gaps (e.g. "no automated backups yet," "search is basic," "some settings are stored locally without encryption") without the AUDIT file's exact attack-surface detail.
- A **Contributing / License** placeholder section (flagging that no LICENSE file currently exists — will ask whether to add one, out of scope for this request unless you want it added now).
- Keep the existing Highlights/Requirements/Getting Started/AI setup/Shortcuts/Build sections as-is (already accurate and already fixed to point at the real clone URL).

## Out of Scope
- Adding a LICENSE file (will flag it, not create one, unless you ask separately).
- Actually fixing the security gaps listed in the audit (CSP, SSRF, plaintext key storage) — this request only removes the *public documentation* of them, not the underlying code issues.
- Any changes to sibling repos (none configured — no `.claude/propagation.json` in this repo).

## Acceptance Criteria
- [x] `AUDIT-2026-06.md` no longer appears in any commit reachable from `origin/main`.
- [x] No commit reachable from `origin/main` contains the personal email or the real name in ledger/report/request files.
- [x] `.gitignore` updated and covers the items listed in Plan §2.
- [x] Future ledger-row instructions updated to use the GitHub handle only.
- [x] `README.md` gives a new visitor: what the project is, how it's structured, how to run it, and an honest (non-exploitable) view of current limitations.
- [x] `git push --force` to `origin/main` completed and verified (GitHub reflects the rewritten history).

## Progress
- [x] Backed up `AUDIT-2026-06.md` to gitignored `.local/AUDIT-2026-06.md`, then `git rm` from tracking (`.gitignore`)
- [x] Added `.gitignore` rules: `.local/`, `*.sqlite`, `*.sqlite3`, `*.db` (`.gitignore`)
- [x] Updated approver-identity instructions to use the GitHub handle instead of real name/email (`.claude/skills/feature-workflow/SKILL.md`, `CLAUDE.md`)
- [x] Rewrote `README.md`: added Status, Known limitations, and Contributing sections; removed the dead link to the deleted audit file
- [x] Recorded this request's own approval in `APPROVALS.md` using the new GitHub-handle-only format
- [x] Installed `git-filter-repo` via Homebrew
- [x] Ran `git-filter-repo` (two passes) to: delete `AUDIT-2026-06.md` from every commit; replace `joshua.lawrence <mcbenaofficial@gmail.com>`, `Joshua Lawrence (mcbenaofficial@gmail.com)`, the bare email, and the bare real name (both cased forms) with `mcbenaofficial` across all commit content
- [x] Verified locally: no reachable commit contains the audit file or the personal email/name in file content
- [x] Force-pushed rewritten history to `origin/main`; verified via `git fetch` that the remote matches
- [x] Bumped version to v1.10.1 in `package.json` and `src-tauri/tauri.conf.json`; added `CHANGELOG.md` entry

## Complete Summary

The MindSpace repo was live on GitHub with two real privacy/security problems: a security-audit document listing exact unpatched vulnerabilities (file/line references for an XSS→command-execution path, an SSRF-capable network proxy, and plaintext API key storage), and the maintainer's real name and personal Gmail address repeated across the approval ledger, metrics, a weekly report, and two request docs. Both were already public and indexable, not just present locally.

Both were removed retroactively: the audit file was deleted and its content purged from every commit via `git filter-repo`, with a private gitignored copy kept for your own reference. The name/email was replaced everywhere in history with the GitHub handle `mcbenaofficial`. The rewritten history was force-pushed, so `origin/main` no longer serves the old blobs. Going forward, the approval workflow itself now writes the GitHub handle instead of real identity info. `README.md` was also expanded so a new visitor understands the project's status, structure, and honest current limitations without exposing exploit-level detail.

## Technical Overview of the Build

- **File removal**: `AUDIT-2026-06.md` backed up to `.local/AUDIT-2026-06.md` (new `.gitignore` entry), then `git rm`'d and purged from all history via `git-filter-repo --path AUDIT-2026-06.md --invert-paths`.
- **History-wide text redaction**: a `--replace-text` rule file fed to `git-filter-repo`, run in two passes — first for the exact `name <email>` and bare-email strings, then for the bare real name in both cased forms (`joshua.lawrence`, `Joshua Lawrence`) once residual "Requested by:" fields were found. Verified via `git log --all -p` that no diff content still contains the audit file or personal identifiers (a few "Author:"/"Committer:" metadata lines and the app's `com.joshualawrence.mindspace` bundle identifier remain — see below).
- **Remote sync**: `git-filter-repo` drops the `origin` remote as a safety measure on every run; re-added both times, then `git push --force origin main`, confirmed by `git fetch` + `git rev-parse` matching local and remote HEAD.
- **Process fix**: `.claude/skills/feature-workflow/SKILL.md` and `CLAUDE.md`'s approval-ledger instructions changed from `git config user.name`/`user.email` to the GitHub handle parsed from the origin remote URL.
- **`.gitignore`**: added `.local/` and `*.sqlite`/`*.sqlite3`/`*.db` as forward-looking guards; confirmed all pre-existing sensitive paths (`node_modules`, `dist`, `src-tauri/target`, `.env*`, `*.pem`, `*.key`, `.codegraph/*.db*`) were already correctly ignored and untracked.
- **`README.md`**: added Status, Known limitations, and Contributing sections; removed the dead link to the now-deleted audit file. Existing Highlights/Requirements/Getting Started/AI setup/Shortcuts/Build/Project structure/Tech stack/Data-and-privacy sections were left intact.
- **Version bump**: `1.10.0` → `1.10.1` in `package.json` and `src-tauri/tauri.conf.json`, treated as a patch (hardening/process/documentation, no functional change).

## Functional Overview of the Build

Nothing changes for you day-to-day using the app. What changes for anyone visiting the public GitHub page: the security-audit document is gone (including from history), your name/email no longer appear anywhere in the repo's history, and the README now gives a fuller picture of what the project is, how it's laid out, and its current limitations — without exposing exploit-level detail. Any future approval you give through this workflow will be recorded under your GitHub handle, not your name or email.

## Expected Behaviour

Per the acceptance criteria: the audit file and personal identifiers gone from every commit reachable from `origin/main`; `.gitignore` covering the agreed items; future ledger rows using the GitHub handle; a more complete `README.md`; and the force-push landed and verified.

## Actual Behaviour

All of the above verified directly:
- `git log --all --oneline -- AUDIT-2026-06.md` returns nothing, both locally and against `origin/main` after fetch.
- `git log --all -p | grep` for the email and real name (in diff-added lines) returns nothing except the unrelated `com.joshualawrence.mindspace` bundle identifier in `tauri.conf.json` — intentionally left alone (out of scope; it's a Tauri/macOS code-signing identifier, not contact info, and changing it risks breaking app identity).
- Commit **author/committer metadata** (`git log --format=%an <%ae>`) still shows the real name/email — this is standard git commit attribution tied to the GitHub account itself, was not in the approved plan's scope, and is not the kind of "personal info in document content" the request was about.
- `git rev-parse origin/main HEAD` returns the same SHA after the force-push, confirming the remote matches local.
- Did not run the app or a build (`bun run tauri dev` / `bun run build`) — this change touches only docs, `.gitignore`, git history, and version strings, no source code, so a functional app run wasn't warranted.

## Test Cases

| # | Scenario | Steps | Expected Result | Actual Result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Audit file removed from history | `git log --all --oneline -- AUDIT-2026-06.md` | No output | No output | Pass |
| 2 | Personal email removed from history content | `git log --all -p \| grep '^\+.*mcbenaofficial@gmail.com'` | No output | No output | Pass |
| 3 | Real name removed from history content | `git log --all -p \| grep '^\+.*[Jj]oshua'` | Only the unrelated bundle identifier remains | Only `com.joshualawrence.mindspace` lines remain | Pass |
| 4 | Remote matches rewritten local history | `git fetch origin && git rev-parse origin/main HEAD` | Same SHA on both lines | Same SHA on both lines | Pass |
| 5 | `.gitignore` covers new risk items | Inspect `.gitignore` for `.local/`, `*.db` family | Present | Present | Pass |
| 6 | Local audit backup preserved | `.local/AUDIT-2026-06.md` exists and is gitignored | File present, `git status` clean | File present, `git status` clean | Pass |
| 7 | README renders sensibly for a new visitor | Manual read-through of `README.md` | Status/limitations/contributing present, no dead links | Present, dead audit-file link removed | Pass |
| 8 | App still builds after doc-only changes | `bun run build` / `bun run tauri dev` | Not run | Not run — no source files touched, considered unnecessary for a docs/git-history-only change | Not run |
