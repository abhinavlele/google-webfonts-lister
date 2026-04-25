#!/usr/bin/env bash
# autoresearch/log.sh — record keep/revert decision, commit or restore worktree.
#
# Usage:
#   log.sh keep   <iter> [note]   # git add -A && git commit
#   log.sh revert <iter> [note]   # git stash push -u then drop (restores baseline)
#
# Updates ./autoresearch.jsonl with a decision record and refreshes the statusline cache.

set -euo pipefail

die() { printf 'autoresearch[log]: %s\n' "$*" >&2; exit 1; }

[[ $# -ge 2 ]] || die "usage: log.sh <keep|revert> <iter> [note]"
decision="$1"; iter="$2"; shift 2
note="${1:-}"
[[ "$decision" == "keep" || "$decision" == "revert" ]] || die "decision must be keep or revert"

jsonl="./autoresearch.jsonl"
md="./autoresearch.md"
[[ -f "$jsonl" ]] || die "no autoresearch.jsonl in cwd"
[[ -f "$md"    ]] || die "no autoresearch.md in cwd"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not in a git work tree"

read -r name metric unit direction < <(python3 - "$md" <<'PY'
import json, sys, pathlib
fm = pathlib.Path(sys.argv[1]).read_text().split("---", 2)[1]
d = json.loads(fm)
print(d.get("name",""), d.get("metric",""), d.get("unit",""), d.get("direction",""))
PY
)

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
confidence_py="$script_dir/confidence.py"
[[ -f "$confidence_py" ]] || confidence_py="$HOME/.claude/scripts/autoresearch/confidence.py"
confidence_json="$(python3 "$confidence_py" --jsonl "$jsonl" --iter "$iter" 2>/dev/null || echo '{}')"

if [[ "$decision" == "keep" ]]; then
  git add -A
  if git diff --cached --quiet; then
    msg="autoresearch[iter $iter]: $name — no-op (nothing changed)"
    git commit --allow-empty -m "$msg" >/dev/null
  else
    summary="$(printf '%s' "$confidence_json" | python3 -c 'import sys,json;
try: d=json.loads(sys.stdin.read())
except Exception: d={}
delta=d.get("delta"); conf=d.get("confidence_pct")
parts=[]
if delta is not None: parts.append(f"Δ={delta:+.4g}")
if conf  is not None: parts.append(f"conf={conf*100:.0f}%")
print(" ".join(parts))')"
    msg="autoresearch[iter $iter]: $name — kept ($metric $unit $summary)"
    [[ -n "$note" ]] && msg="$msg
$note"
    git commit -m "$msg" >/dev/null
  fi
  printf 'autoresearch[log]: kept iter %s (%s)\n' "$iter" "$summary"
else
  if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
    printf 'autoresearch[log]: nothing to revert at iter %s\n' "$iter"
  else
    git stash push --include-untracked -m "autoresearch-revert-$iter" >/dev/null
    git stash drop "stash@{0}" >/dev/null 2>&1 || true
    printf 'autoresearch[log]: reverted iter %s\n' "$iter"
  fi
fi

python3 - "$jsonl" "$iter" "$decision" "$note" "$confidence_json" <<'PY'
import json, sys, pathlib, datetime
jsonl, iter_, decision, note, confidence_json = sys.argv[1:]
try: conf = json.loads(confidence_json) if confidence_json else {}
except Exception: conf = {}
record = {
    "ts": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.datetime.utcnow().microsecond//1000:03d}Z",
    "iter": int(iter_), "role": "decision", "decision": decision,
    "note": note, "confidence": conf,
}
with open(jsonl, "a") as f:
    f.write(json.dumps(record) + "\n")
PY

state_dir="$HOME/.claude"
mkdir -p "$state_dir"
state_file="$state_dir/autoresearch_state.json"
cache_file="$state_dir/autoresearch_status_cache.txt"
if [[ -f "$state_file" ]]; then
  python3 - "$state_file" "$jsonl" "$cache_file" "$iter" "$decision" "$confidence_json" <<'PY'
import json, sys, pathlib
state_path, jsonl, cache_path, iter_, decision, confidence_json = sys.argv[1:]
state = json.loads(pathlib.Path(state_path).read_text())
state["current_iteration"] = max(int(state.get("current_iteration",0)), int(iter_))
try: conf = json.loads(confidence_json) if confidence_json else {}
except Exception: conf = {}
candidate = conf.get("candidate_value")
direction = state.get("direction","min")
if candidate is not None and decision == "keep":
    best = state.get("best")
    better = best is None or (
        (direction == "min" and candidate < best) or
        (direction == "max" and candidate > best)
    )
    if better: state["best"] = candidate
pathlib.Path(state_path).write_text(json.dumps(state, indent=2))
name = state.get("name","?"); metric = state.get("metric","?"); unit = state.get("unit","")
best = state.get("best")
delta = conf.get("delta"); cpct = conf.get("confidence_pct")
parts = [f"🔬 {name}: iter {iter_} {decision}"]
if candidate is not None: parts.append(f"{metric}={candidate:g}{unit}")
if delta is not None: parts.append(f"Δ={delta:+.3g}")
if cpct is not None: parts.append(f"conf={cpct*100:.0f}%")
if best is not None: parts.append(f"best={best:g}{unit}")
pathlib.Path(cache_path).write_text(" ".join(parts) + "\n")
PY
fi
