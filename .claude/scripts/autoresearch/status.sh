#!/usr/bin/env bash
# autoresearch/status.sh — emit a single line for the statusline (or empty).
# Reads ~/.claude/autoresearch_status_cache.txt, refreshed by log.sh / init.sh.

set -euo pipefail

state="$HOME/.claude/autoresearch_state.json"
cache="$HOME/.claude/autoresearch_status_cache.txt"

[[ -f "$state" ]] || exit 0

active="$(python3 -c 'import json,sys,pathlib;
try: print(json.loads(pathlib.Path(sys.argv[1]).read_text()).get("active", False))
except Exception: print(False)' "$state" 2>/dev/null || echo False)"
[[ "$active" == "True" ]] || exit 0

if [[ -f "$cache" ]]; then
  head -n 1 "$cache"
else
  python3 -c 'import json,sys,pathlib;
d=json.loads(pathlib.Path(sys.argv[1]).read_text());
print(f"🔬 {d.get(\"name\",\"?\")}: {d.get(\"metric\",\"?\")} iter {d.get(\"current_iteration\",0)}")' "$state"
fi
