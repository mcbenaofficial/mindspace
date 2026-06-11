#!/usr/bin/env python3
"""RiServe harness weekly report.

Gathers the week's facts into docs/reports/<YYYY>-W<ww>.md:
  - code changes from git (commits, authors, lines)
  - enhancements deployed (CHANGELOG entries in window)
  - approval-ledger activity
  - review quality score per completed request + weekly average

The generated-data block sits between GENERATED:START/END markers and is
replaced on re-run; the qualitative sections below it (filled by the
weekly-report skill / the team) are preserved.

Usage: python3 harness-report.py [project-root] [--days N]
"""
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

args = [a for a in sys.argv[1:]]
DAYS = 7
if "--days" in args:
    i = args.index("--days")
    DAYS = int(args[i + 1])
    del args[i:i + 2]
ROOT = Path(args[0]).resolve() if args else Path.cwd()
REQ = ROOT / "docs" / "requests"
REPORTS = ROOT / "docs" / "reports"

now = datetime.now().astimezone()
start = now - timedelta(days=DAYS)
year, week, _ = now.isocalendar()
OUT = REPORTS / f"{year}-W{week:02d}.md"
START_MARK = "<!-- GENERATED:START -->"
END_MARK = "<!-- GENERATED:END -->"


def run(cmd):
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def parse_ts(s):
    s = (s or "").strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s[:30] if "T" in s else s[:10], fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ---- git ---------------------------------------------------------------
since = start.strftime("%Y-%m-%d")
git_lines = []
log = run(["git", "log", f"--since={since}", "--pretty=format:%h|%ad|%an|%s", "--date=short"])
if log is None:
    git_lines.append("_Not a git repository (or git unavailable) — code changes cannot be tracked. Initialize git to enable this section._")
elif not log:
    git_lines.append("_No commits in this period._")
else:
    commits = [l.split("|", 3) for l in log.splitlines() if l.strip()]
    numstat = run(["git", "log", f"--since={since}", "--numstat", "--pretty=format:"]) or ""
    add = rem = files = 0
    seen = set()
    for l in numstat.splitlines():
        p = l.split("\t")
        if len(p) == 3:
            a, r, fn = p
            add += int(a) if a.isdigit() else 0
            rem += int(r) if r.isdigit() else 0
            seen.add(fn)
    files = len(seen)
    authors = {}
    for c in commits:
        authors[c[2]] = authors.get(c[2], 0) + 1
    git_lines.append(f"**{len(commits)} commits** by {', '.join(f'{a} ({n})' for a, n in sorted(authors.items(), key=lambda x: -x[1]))} — {files} files touched, +{add}/−{rem} lines.")
    git_lines.append("")
    git_lines.append("| Commit | Date | Author | Subject |")
    git_lines.append("|---|---|---|---|")
    for h, d, a, s in commits[:50]:
        git_lines.append(f"| `{h}` | {d} | {a} | {s} |")
    if len(commits) > 50:
        git_lines.append(f"| … | | | +{len(commits) - 50} more commits |")

# ---- changelog (deployed) ------------------------------------------------
deploy_lines = []
cl = ROOT / "CHANGELOG.md"
if cl.exists():
    text = cl.read_text()
    for m in re.finditer(r"^## \[?(v?[\d.]+)\]?\s*[—-]+\s*(\d{4}-\d{2}-\d{2})\s*$(.*?)(?=^## |\Z)", text, re.M | re.S):
        ver, date_s, body = m.group(1), m.group(2), m.group(3).strip()
        ts = parse_ts(date_s)
        if ts and ts >= start.replace(hour=0, minute=0, second=0):
            deploy_lines.append(f"### {ver} — {date_s}")
            deploy_lines.append(body)
            deploy_lines.append("")
if not deploy_lines:
    deploy_lines.append("_No releases recorded in CHANGELOG.md this period._")

# ---- ledger activity ----------------------------------------------------
ledger_rows = []
LEDGER = REQ / "APPROVALS.md"
if LEDGER.exists():
    for line in LEDGER.read_text().splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and cells[0] not in ("Timestamp", "") and not re.match(r"^-+$", cells[0]):
            ts = parse_ts(cells[0])
            if ts and ts >= start:
                ledger_rows.append(cells)
ledger_lines = []
if ledger_rows:
    ledger_lines.append("| Timestamp | Request | Decision | Approver |")
    ledger_lines.append("|---|---|---|---|")
    for c in ledger_rows:
        ledger_lines.append(f"| {c[0]} | {c[1]} | {c[2]} | {c[3] if len(c) > 3 else ''} |")
else:
    ledger_lines.append("_No approval-ledger activity this period._")

# ---- quality score for requests completed this week ----------------------
completed = [c for c in ledger_rows if c[2].lower() == "completed"]
score_lines = []
scores = []
for c in completed:
    fname = c[1]
    p = REQ / fname
    if not p.exists():
        score_lines.append(f"| {fname} | — | — | ⚠ plan file missing | 0 |")
        scores.append(0)
        continue
    text = p.read_text()
    tc_pass = tc_fail = tc_notrun = 0
    tc = re.search(r"## Test Cases(.*?)(\n## |\Z)", text, re.S)
    if tc:
        for line in tc.group(1).splitlines():
            cells = [x.strip() for x in line.strip().strip("|").split("|")]
            if len(cells) >= 6 and cells[0] not in ("#", "") and not re.match(r"^-+$", cells[0]):
                v = cells[-1].lower()
                if "fail" in v and "pass" not in v:
                    tc_fail += 1
                elif "pass" in v:
                    tc_pass += 1
                else:
                    tc_notrun += 1
    deviated = bool(re.search(r"deviat", text, re.I))
    version = bool(re.search(r"\*\*Release version:\*\*\s*v?\d", text))
    approved_in_ledger = LEDGER.exists() and any(
        f"| {fname} |" in l and "| Approved |" in l for l in LEDGER.read_text().splitlines()
    )
    s = 100
    issues = []
    if not approved_in_ledger:
        s -= 25; issues.append("unapproved")
    s -= min(tc_fail * 15, 45)
    if tc_fail: issues.append(f"{tc_fail} failing test(s)")
    s -= min(tc_notrun * 5, 20)
    if tc_notrun: issues.append(f"{tc_notrun} not-run test(s)")
    if deviated:
        s -= 10; issues.append("deviated from plan")
    if not version:
        s -= 10; issues.append("no release version")
    s = max(s, 0)
    scores.append(s)
    title_m = re.search(r"^#\s+(.+)$", text, re.M)
    score_lines.append(f"| [{title_m.group(1) if title_m else fname}]({Path('..') / 'requests' / fname}) | {tc_pass}✓ {tc_fail}✗ {tc_notrun}– | {'yes' if deviated else 'no'} | {', '.join(issues) or '—'} | **{s}** |")

avg_score = f"{sum(scores) / len(scores):.0f}" if scores else "—"
quality = ["| Request | Tests | Deviated | Issues | Score /100 |", "|---|---|---|---|---|"] + (score_lines or ["| _none completed this period_ | | | | |"])

generated = "\n".join([
    START_MARK,
    f"_Generated {now.strftime('%Y-%m-%d %H:%M %Z')} · window: {start.strftime('%Y-%m-%d')} → {now.strftime('%Y-%m-%d')} ({DAYS} days) · project: `{ROOT.name}`_",
    "",
    "## Code Changes",
    "", *git_lines, "",
    "## Enhancements Deployed",
    "", *deploy_lines, "",
    "## Approval Activity",
    "", *ledger_lines, "",
    "## Review Quality (matrix score)",
    "",
    f"**Weekly quality score: {avg_score}/100** (avg of completed requests; 100 − 25·unapproved − 15·failing test − 5·not-run test − 10·deviation − 10·missing version)",
    "", *quality, "",
    END_MARK,
])

QUALITATIVE = """
## Mistakes & Lessons Learned
<!-- For each issue/flag above: what happened, root cause, how we prevent it. -->

## Repeated Mistakes
<!-- Compare with previous weeks' reports in docs/reports/. Call out anything happening again. -->

## Workflow Improvements
<!-- Concrete process changes proposed, with owner. -->

## Plan for Next Week
<!-- Carry-overs, upcoming requests, priorities. -->
"""

REPORTS.mkdir(parents=True, exist_ok=True)
if OUT.exists() and START_MARK in OUT.read_text():
    old = OUT.read_text()
    new = re.sub(re.escape(START_MARK) + r".*?" + re.escape(END_MARK), generated, old, flags=re.S)
    OUT.write_text(new)
else:
    OUT.write_text(f"# Weekly Report — {ROOT.name} — {year}-W{week:02d}\n\n{generated}\n{QUALITATIVE}")
print(f"Wrote {OUT} — quality score {avg_score}/100, {len(completed)} completed request(s) in window.")
