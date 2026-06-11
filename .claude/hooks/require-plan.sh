#!/bin/bash
# RiServe harness — PreToolUse gate.
# Blocks Edit/Write/NotebookEdit unless an approved plan (Status: 🔵 In Progress)
# exists in docs/requests/. Exit 0 = allow, exit 2 = block (stderr shown to Claude).

INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    ti = d.get("tool_input", {}) or {}
    print(ti.get("file_path") or ti.get("notebook_path") or "")
except Exception:
    print("")
')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("cwd",""))
except Exception: print("")')}"
[ -z "$PROJECT_DIR" ] && PROJECT_DIR="$PWD"

# Emergency bypass: touch .claude/harness-bypass to disable the gate temporarily.
if [ -f "$PROJECT_DIR/.claude/harness-bypass" ]; then
  exit 0
fi

# Paths that must stay writable so plans can be created, approved, and reported:
case "$FILE_PATH" in
  *"/docs/requests/"*|*"CHANGELOG.md"|*"CLAUDE.md"|*"README.md"|*"/.claude/"*|"$HOME/.claude/"*)
    exit 0
    ;;
esac

# Allow only if a plan is In Progress AND its approval is recorded in the
# append-only ledger (docs/requests/APPROVALS.md). Both signals are required —
# a status flip without a ledger row does not open the gate.
LEDGER="$PROJECT_DIR/docs/requests/APPROVALS.md"
for f in "$PROJECT_DIR"/docs/requests/*.md; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  case "$base" in APPROVALS.md|METRICS.md) continue ;; esac
  if grep -qs 'Status:\*\* 🔵 In Progress' "$f"; then
    if [ -f "$LEDGER" ] && grep -F "| $base |" "$LEDGER" | grep -q '| Approved |'; then
      exit 0
    fi
  fi
done

cat >&2 <<'EOF'
BLOCKED by the RiServe feature-workflow harness: no approved plan is active.

Source edits require BOTH:
  1. a plan file in docs/requests/ with status "🔵 In Progress", AND
  2. a matching "Approved" row in docs/requests/APPROVALS.md (the append-only
     approval ledger: | <timestamp> | <plan-filename> | Approved | <approver> | <notes> |).

Follow the feature-workflow skill: gather requirements, write the plan
(status 🟡 Awaiting Approval), present it, and WAIT for the user's explicit
approval. Only after the user approves may you set the status to In Progress
and append the ledger row. Never do either without the user's approval message.
EOF
exit 2
