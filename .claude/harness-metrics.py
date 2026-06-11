#!/usr/bin/env python3
"""RiServe harness metrics.

Parses docs/requests/*.md plan files and the APPROVALS.md ledger, then writes
docs/requests/METRICS.md: one row per request plus aggregates and integrity
flags (unapproved work, shipped failures, plan deviations).

Usage: python3 harness-metrics.py [project-root]
"""
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
REQ = ROOT / "docs" / "requests"
LEDGER = REQ / "APPROVALS.md"
OUT = REQ / "METRICS.md"
SPECIAL = {"APPROVALS.md", "METRICS.md"}


def field(text, name):
    m = re.search(r"\*\*" + re.escape(name) + r":\*\*\s*(.+)", text)
    return m.group(1).strip() if m else ""


def parse_ts(s):
    s = (s or "").strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S%z", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s[:30] if fmt != "%Y-%m-%d" else s[:10], fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def days_between(a, b):
    if a and b:
        return round((b - a).total_seconds() / 86400, 1)
    return None


# ---- ledger ----------------------------------------------------------------
ledger_rows = []  # (ts_raw, ts, file, decision, approver, notes)
if LEDGER.exists():
    for line in LEDGER.read_text().splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and cells[0] not in ("Timestamp", "---", ""):
            if re.match(r"^-+$", cells[0]):
                continue
            ts_raw, fname, decision = cells[0], cells[1], cells[2]
            approver = cells[3] if len(cells) > 3 else ""
            notes = cells[4] if len(cells) > 4 else ""
            ledger_rows.append((ts_raw, parse_ts(ts_raw), fname, decision, approver, notes))

def ledger_for(fname, decision):
    return [r for r in ledger_rows if r[2] == fname and r[3].lower() == decision.lower()]


# ---- plan files -------------------------------------------------------------
requests = []
plan_files = sorted(p for p in REQ.glob("*.md") if p.name not in SPECIAL) if REQ.exists() else []
for p in plan_files:
    text = p.read_text()
    title_m = re.search(r"^#\s+(.+)$", text, re.M)
    status = field(text, "Status")
    raised = parse_ts(field(text, "Date raised")) or parse_ts(p.name[:10])
    version = field(text, "Release version")

    approvals = ledger_for(p.name, "Approved")
    completions = ledger_for(p.name, "Completed")
    approved_at = approvals[0][1] if approvals else parse_ts(field(text, "Approved"))
    completed_at = completions[0][1] if completions else None

    # test-case table: count Pass / Fail / Not run in the last cell of each row
    tc_pass = tc_fail = tc_notrun = 0
    tc_section = re.search(r"## Test Cases(.*?)(\n## |\Z)", text, re.S)
    if tc_section:
        for line in tc_section.group(1).splitlines():
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 6 and cells[0] not in ("#", "") and not re.match(r"^-+$", cells[0]):
                verdict = cells[-1].lower()
                if "fail" in verdict and "pass" not in verdict:
                    tc_fail += 1
                elif "pass" in verdict:
                    tc_pass += 1
                else:
                    tc_notrun += 1

    deviations = len(re.findall(r"deviat", text, re.I))

    flags = []
    in_build = ("In Progress" in status) or ("Complete" in status)
    if in_build and not approvals:
        flags.append("UNAPPROVED — no Approved row in ledger")
    if "Complete" in status and tc_fail:
        flags.append(f"SHIPPED WITH {tc_fail} FAILING TEST(S)")
    if "Complete" in status and tc_notrun:
        flags.append(f"{tc_notrun} TEST(S) NOT RUN")
    if deviations:
        flags.append("DEVIATED FROM PLAN")
    if "Complete" in status and not version:
        flags.append("NO RELEASE VERSION")

    requests.append({
        "file": p.name,
        "title": title_m.group(1).strip() if title_m else p.name,
        "status": status or "?",
        "version": version or "—",
        "approver": approvals[0][4] if approvals else "—",
        "lead": days_between(raised, approved_at),
        "build": days_between(approved_at, completed_at),
        "tests": f"{tc_pass}✓ {tc_fail}✗ {tc_notrun}–" if (tc_pass + tc_fail + tc_notrun) else "—",
        "tc": (tc_pass, tc_fail, tc_notrun),
        "flags": flags,
    })

# ledger rows pointing at plan files that don't exist
orphans = sorted({r[2] for r in ledger_rows if r[2] and not (REQ / r[2]).exists()})

# ---- aggregates --------------------------------------------------------------
n = len(requests)
done = [r for r in requests if "Complete" in r["status"]]
flagged = [r for r in requests if r["flags"]]
leads = [r["lead"] for r in requests if r["lead"] is not None]
builds = [r["build"] for r in requests if r["build"] is not None]
tp = sum(r["tc"][0] for r in requests)
tf = sum(r["tc"][1] for r in requests)
tn = sum(r["tc"][2] for r in requests)
total_tc = tp + tf + tn

def avg(xs):
    return f"{sum(xs)/len(xs):.1f}" if xs else "—"

lines = [
    "# Harness Metrics",
    "",
    "_Generated by `.claude/harness-metrics.py` — do not edit by hand. Regenerate with:_",
    "`python3 .claude/harness-metrics.py`",
    "",
    "## Scorecard",
    "",
    "| Metric | Value |",
    "|---|---|",
    f"| Requests (total) | {n} |",
    f"| Completed | {len(done)} |",
    f"| In progress / awaiting | {n - len(done)} |",
    f"| Avg approval lead time (days) | {avg(leads)} |",
    f"| Avg build time, approve→complete (days) | {avg(builds)} |",
    f"| Test cases (pass / fail / not run) | {tp} / {tf} / {tn} |",
    f"| Test pass rate | {f'{100*tp/total_tc:.0f}%' if total_tc else '—'} |",
    f"| Requests with integrity flags | {len(flagged)} |",
    f"| Approval events in ledger | {len(ledger_rows)} |",
    "",
    "## Requests",
    "",
    "| Request | Status | Version | Approver | Lead (d) | Build (d) | Tests | Flags |",
    "|---|---|---|---|---|---|---|---|",
]
for r in requests:
    lines.append(
        f"| [{r['title']}]({r['file']}) | {r['status']} | {r['version']} | {r['approver']} "
        f"| {r['lead'] if r['lead'] is not None else '—'} | {r['build'] if r['build'] is not None else '—'} "
        f"| {r['tests']} | {'; '.join(r['flags']) or '—'} |"
    )

lines += ["", "## Integrity", ""]
if not flagged and not orphans:
    lines.append("No integrity issues detected.")
for r in flagged:
    for fl in r["flags"]:
        lines.append(f"- ⚠ `{r['file']}` — {fl}")
for o in orphans:
    lines.append(f"- ⚠ Ledger references missing plan file `{o}`")

REQ.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(lines) + "\n")
print(f"Wrote {OUT} — {n} request(s), {len(flagged)} flagged.")
