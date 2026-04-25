---
name: autoresearch-stop
description: Finalize the active autoresearch session — append summary to autoresearch.md, clear state, instruct user to /cancel-ralph if a loop is running.
---

# /autoresearch-stop

Cleanly finalize the autoresearch session.

## Action

Run from the session's cwd:

```bash
python3 - <<'PY'
import json, pathlib, datetime, sys
state_path = pathlib.Path.home() / ".claude" / "autoresearch_state.json"
md = pathlib.Path("autoresearch.md")
jsonl = pathlib.Path("autoresearch.jsonl")

if not state_path.exists() or not json.loads(state_path.read_text()).get("active"):
    print("No active autoresearch session to stop.")
    sys.exit(0)

state = json.loads(state_path.read_text())
ended_at = datetime.datetime.utcnow().isoformat() + "Z"

baseline = []
candidates_by_iter = {}
decisions = []
if jsonl.exists():
    for line in jsonl.read_text().splitlines():
        line = line.strip()
        if not line: continue
        try: r = json.loads(line)
        except json.JSONDecodeError: continue
        role = r.get("role")
        if role == "baseline" and isinstance(r.get("metric"),(int,float)):
            baseline.append(r["metric"])
        elif role == "candidate" and isinstance(r.get("metric"),(int,float)):
            candidates_by_iter.setdefault(r["iter"], []).append(r["metric"])
        elif role == "decision":
            decisions.append(r)

def median(vs):
    s = sorted(vs); n=len(s)
    return None if n==0 else (s[n//2] if n%2 else (s[n//2-1]+s[n//2])/2)

direction = state.get("direction","min")
metric = state.get("metric","?"); unit = state.get("unit","")
base_med = median(baseline)
best = state.get("best")
kept = sum(1 for d in decisions if d.get("decision")=="keep")
reverted = sum(1 for d in decisions if d.get("decision")=="revert")
total_iters = len(candidates_by_iter)
delta = (best - base_med) if (best is not None and base_med is not None) else None
delta_pct = (100.0*delta/base_med) if (delta is not None and base_med) else None

summary = (
    f"\n## Summary (closed {ended_at})\n\n"
    f"- Iterations: {total_iters} ({kept} kept, {reverted} reverted)\n"
    f"- Baseline median {metric}: {base_med}{unit}\n"
    f"- Best {metric}: {best}{unit}\n"
)
if delta is not None:
    summary += f"- Delta: {delta:+.4g}{unit}"
    if delta_pct is not None:
        summary += f" ({delta_pct:+.2f}%)"
    summary += "\n"
summary += f"- Direction: {direction}\n"

if md.exists():
    text = md.read_text()
    if "## Summary" in text:
        text = text.split("## Summary",1)[0].rstrip() + summary
    else:
        text = text.rstrip() + summary
    md.write_text(text)
    print(f"Appended summary to {md}")
else:
    print(f"Warning: {md} not found; skipping summary write.")

state_path.write_text(json.dumps({"active": False}, indent=2))
cache = pathlib.Path.home() / ".claude" / "autoresearch_status_cache.txt"
if cache.exists():
    try: cache.unlink()
    except OSError: pass

print("Session closed.")
print("If a /ralph-loop is still running for this session, cancel it with /cancel-ralph.")
PY
```

After running:
- Confirm to the user the session was closed.
- If `/cancel-ralph` is needed, remind them.
- Suggest reviewing the summary in `autoresearch.md` and the per-iteration history in `autoresearch.jsonl`.
