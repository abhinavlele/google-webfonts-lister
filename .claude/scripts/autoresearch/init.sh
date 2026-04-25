#!/usr/bin/env bash
# autoresearch/init.sh — scaffold an autoresearch session in the current project.
#
# Usage:
#   init.sh <name> --metric <metric> --unit <unit> --direction <min|max> \
#       [--baseline-cmd "<cmd>"] [--candidate-cmd "<cmd>"] \
#       [--metric-extractor <python-regex>] [--threshold <0..1>] [--baseline-samples <N>]
#
# Writes:
#   ./autoresearch.md              session config + log (in cwd)
#   ./autoresearch.jsonl           append-only experiment log (in cwd)
#   ~/.claude/autoresearch_state.json   active-session pointer
#
# Refuses to start if cwd has uncommitted changes.

set -euo pipefail

die() { printf 'autoresearch[init]: %s\n' "$*" >&2; exit 1; }

name=""
metric=""
unit=""
direction=""
baseline_cmd=""
candidate_cmd=""
extractor='([-+]?[0-9]*\.?[0-9]+)'
threshold="0.80"
baseline_samples="5"

[[ $# -ge 1 ]] || die "usage: init.sh <name> --metric <m> --unit <u> --direction <min|max> [...]"
name="$1"; shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --metric)            metric="$2"; shift 2 ;;
    --unit)              unit="$2"; shift 2 ;;
    --direction)         direction="$2"; shift 2 ;;
    --baseline-cmd)      baseline_cmd="$2"; shift 2 ;;
    --candidate-cmd)     candidate_cmd="$2"; shift 2 ;;
    --metric-extractor)  extractor="$2"; shift 2 ;;
    --threshold)         threshold="$2"; shift 2 ;;
    --baseline-samples)  baseline_samples="$2"; shift 2 ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ -n "$metric"    ]] || die "--metric required"
[[ -n "$unit"      ]] || die "--unit required"
[[ -n "$direction" ]] || die "--direction required"
[[ "$direction" == "min" || "$direction" == "max" ]] || die "--direction must be min or max"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "not inside a git work tree (run: git init)"

if ! git diff --quiet \
   || ! git diff --cached --quiet \
   || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  die "working tree has uncommitted changes (or untracked files) — commit or stash first"
fi

cwd="$(pwd)"
md="$cwd/autoresearch.md"
jsonl="$cwd/autoresearch.jsonl"

[[ ! -e "$md"    ]] || die "$md already exists — refusing to overwrite"
[[ ! -e "$jsonl" ]] || die "$jsonl already exists — refusing to overwrite"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git_head="$(git rev-parse HEAD 2>/dev/null || echo 'no-commits')"

python3 - "$md" <<'PY' "$name" "$metric" "$unit" "$direction" "$extractor" "$threshold" "$baseline_samples" "$baseline_cmd" "$candidate_cmd" "$started_at" "$git_head"
import json, sys, pathlib
md_path, name, metric, unit, direction, extractor, threshold, baseline_samples, baseline_cmd, candidate_cmd, started_at, git_head = sys.argv[1:]
front = {
    "name": name,
    "metric": metric,
    "unit": unit,
    "direction": direction,
    "metric_extractor": extractor,
    "threshold": float(threshold),
    "baseline_samples": int(baseline_samples),
    "baseline_cmd": baseline_cmd,
    "candidate_cmd": candidate_cmd,
    "started_at": started_at,
    "baseline_git_head": git_head,
}
body = (
    "---\n"
    + json.dumps(front, indent=2)
    + "\n---\n\n"
    f"# Autoresearch: {name}\n\n"
    f"Optimizing **{metric}** ({unit}), direction: **{direction}**.\n\n"
    "## Hypotheses\n\n_Write each hypothesis the agent tries here._\n\n"
    "## Iterations\n\n_Iteration results are appended to `autoresearch.jsonl`._\n\n"
    "## Summary\n\n_Filled in by `/autoresearch-stop`._\n"
)
pathlib.Path(md_path).write_text(body)
PY

: > "$jsonl"

state_dir="$HOME/.claude"
mkdir -p "$state_dir"
state_file="$state_dir/autoresearch_state.json"
python3 - "$state_file" <<'PY' "$name" "$metric" "$unit" "$direction" "$cwd" "$started_at" "$threshold"
import json, sys, pathlib
state_path, name, metric, unit, direction, cwd, started_at, threshold = sys.argv[1:]
pathlib.Path(state_path).write_text(json.dumps({
    "active": True,
    "name": name,
    "metric": metric,
    "unit": unit,
    "direction": direction,
    "working_directory": cwd,
    "started_at": started_at,
    "threshold": float(threshold),
    "best": None,
    "current_iteration": 0,
}, indent=2))
PY

cache="$state_dir/autoresearch_status_cache.txt"
printf '🔬 %s: %s — iter 0\n' "$name" "$metric" > "$cache"

printf 'autoresearch[init]: session "%s" ready in %s\n' "$name" "$cwd"
printf '  metric=%s unit=%s direction=%s threshold=%s\n' "$metric" "$unit" "$direction" "$threshold"
printf '  files: autoresearch.md, autoresearch.jsonl\n'
printf '  state: %s\n' "$state_file"
