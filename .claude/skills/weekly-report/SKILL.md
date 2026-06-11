---
name: weekly-report
description: Generate the weekly development report for this project — code changes, enhancements deployed, approval activity, and review quality scores — then analyze mistakes, repeated issues, and workflow improvements. Use when the user asks for the weekly report, a week in review, or to prepare the report to send for review.
---

# Weekly Report

Produces `docs/reports/<YYYY>-W<ww>.md`: a factual, script-generated record of the week plus an honest analysis written by you. The team sends this file up for review, so it must be complete and truthful — it exists so mistakes are learned from, not hidden.

## Steps

1. **Refresh the data.** Run both scripts from the project root:

   ```bash
   python3 .claude/harness-metrics.py
   python3 .claude/harness-report.py            # add --days N for a different window
   ```

   The report script fills everything between the `GENERATED` markers: commits/authors/lines from git, CHANGELOG releases this week, approval-ledger activity, and a **review quality score** per completed request (100 minus penalties for unapproved work, failing tests, unrun tests, plan deviations, missing versions) with the weekly average.

2. **Read the evidence.** Read the generated report, every plan file completed or active this week in `docs/requests/`, and the **previous 2–3 reports** in `docs/reports/` if they exist.

3. **Write the qualitative sections** (below the generated block — they are preserved on regeneration):
   - **Mistakes & Lessons Learned** — for every integrity flag, failing test, deviation, or score penalty this week: what happened, the root cause, and a concrete prevention. Cite the request file. If the week was clean, say so plainly.
   - **Repeated Mistakes** — compare against previous reports. Anything appearing a second time gets named explicitly, with why the previous prevention didn't hold. This section is the whole point of the report — never skip it.
   - **Workflow Improvements** — concrete, actionable process changes (not platitudes), each with a suggested owner.
   - **Plan for Next Week** — carry-overs, in-flight requests, priorities.

4. **Report back** with the file path, the weekly quality score, and a 3-line executive summary the user can paste into chat when sending the report.

## Rules

- Never edit anything between `<!-- GENERATED:START -->` and `<!-- GENERATED:END -->` — rerun the script instead.
- Be truthful. A low score with honest analysis is acceptable; a polished report that hides a failure is not.
- If the project is not a git repository, the code-changes section will say so — recommend `git init` to the user rather than reconstructing changes by hand.
