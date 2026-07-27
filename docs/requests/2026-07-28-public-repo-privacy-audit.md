# Public Repo Privacy & Onboarding Audit

- **Status:** 🔵 In Progress
- **Date raised:** 2026-07-28
- **Requested by:** mcbenaofficial
- **Release version:** TBD on completion
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
- [ ] `AUDIT-2026-06.md` no longer appears in any commit reachable from `origin/main`.
- [ ] No commit reachable from `origin/main` contains `mcbenaofficial` or the real name in ledger/report/request files.
- [ ] `.gitignore` updated and covers the items listed in Plan §2.
- [ ] Future ledger-row instructions updated to use the GitHub handle only.
- [ ] `README.md` gives a new visitor: what the project is, how it's structured, how to run it, and an honest (non-exploitable) view of current limitations.
- [ ] `git push --force` to `origin/main` completed and verified (GitHub reflects the rewritten history).
