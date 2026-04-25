#!/usr/bin/env bash
# autoresearch/run.sh — run a benchmark command, parse the metric, append to autoresearch.jsonl.
#
# Usage:
#   run.sh <baseline|candidate> [iteration_id] [--cmd "<override>"]
#
# Reads ./autoresearch.md frontmatter for baseline_cmd / candidate_cmd / metric_extractor.
# Appends one JSONL line:
#   {"ts":..., "iter":N, "role":"baseline|candidate", "cmd":..., "exit":N,
#    "duration_s":F, "metric":F|null, "raw_tail":"..."}

set -euo pipefail

die() { printf 'autoresearch[run]: %s\n' "$*" >&2; exit 1; }

[[ $# -ge 1 ]] || die "usage: run.sh <baseline|candidate> [iter] [--cmd '<override>']"
role="$1"; shift
[[ "$role" == "baseline" || "$role" == "candidate" ]] || die "role must be baseline or candidate"

iter=""
override_cmd=""
if [[ $# -gt 0 && "$1" != --* ]]; then
  iter="$1"; shift
fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cmd) override_cmd="$2"; shift 2 ;;
    *) die "unknown arg: $1" ;;
  esac
done

md="./autoresearch.md"
jsonl="./autoresearch.jsonl"
[[ -f "$md"    ]] || die "no autoresearch.md in cwd — run /autoresearch first"
[[ -f "$jsonl" ]] || die "no autoresearch.jsonl in cwd"

cmd="$override_cmd"
if [[ -z "$cmd" ]]; then
  cmd="$(python3 - "$md" "$role" <<'PY'
import json, sys, pathlib
md, role = sys.argv[1:]
text = pathlib.Path(md).read_text()
fm = text.split("---", 2)[1]
data = json.loads(fm)
key = "baseline_cmd" if role == "baseline" else "candidate_cmd"
print(data.get(key, "") or "")
PY
)"
fi
[[ -n "$cmd" ]] || die "no command configured for role=$role (set baseline_cmd/candidate_cmd in autoresearch.md or pass --cmd)"

extractor="$(python3 - "$md" <<'PY'
import json, sys, pathlib
text = pathlib.Path(sys.argv[1]).read_text()
fm = text.split("---", 2)[1]
print(json.loads(fm).get("metric_extractor", "([-+]?[0-9]*\\.?[0-9]+)"))
PY
)"

if [[ -z "$iter" ]]; then
  iter="$(python3 - "$jsonl" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
maxi = 0
if p.exists():
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line: continue
        try: maxi = max(maxi, int(json.loads(line).get("iter", 0)))
        except Exception: pass
print(maxi + 1)
PY
)"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
out_file="$(mktemp)"
trap 'rm -f "$out_file"' EXIT

start_ns="$(date +%s%N)"
set +e
bash -c "$cmd" >"$out_file" 2>&1
exit_code=$?
set -e
end_ns="$(date +%s%N)"
duration_s="$(awk -v s="$start_ns" -v e="$end_ns" 'BEGIN{printf "%.6f", (e-s)/1e9}')"

raw_tail="$(tail -c 4096 "$out_file" || true)"

python3 - "$jsonl" "$out_file" "$ts" "$iter" "$role" "$cmd" "$exit_code" "$duration_s" "$extractor" <<'PY'
import json, re, sys, pathlib
jsonl, out_file, ts, iter_, role, cmd, exit_code, duration_s, extractor = sys.argv[1:]
text = pathlib.Path(out_file).read_text(errors="replace")
metric = None
try:
    matches = re.findall(extractor, text)
    if matches:
        last = matches[-1]
        if isinstance(last, tuple):
            last = next((g for g in last if g), "")
        metric = float(last)
except (re.error, ValueError):
    metric = None
if metric is None and exit_code == 0:
    try: metric = float(duration_s)
    except ValueError: pass
record = {
    "ts": ts, "iter": int(iter_), "role": role, "cmd": cmd,
    "exit": int(exit_code), "duration_s": float(duration_s),
    "metric": metric, "raw_tail": text[-512:],
}
with open(jsonl, "a") as f:
    f.write(json.dumps(record) + "\n")
print(json.dumps({k: v for k, v in record.items() if k != "raw_tail"}))
PY
