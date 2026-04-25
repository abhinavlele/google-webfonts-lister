---
name: autoresearch-status
description: Show the current autoresearch session — config, last 10 jsonl rows, leaderboard, confidence trend.
---

# /autoresearch-status

Print a digest of the active autoresearch session.

## Action

Run this in the current working directory:

```bash
python3 - <<'PY'
import json, pathlib, os, sys
state_path = pathlib.Path.home() / ".claude" / "autoresearch_state.json"
md = pathlib.Path("autoresearch.md")
jsonl = pathlib.Path("autoresearch.jsonl")

if not state_path.exists() or not json.loads(state_path.read_text()).get("active"):
    print("No active autoresearch session.")
    sys.exit(0)

state = json.loads(state_path.read_text())
print(f"Session:  {state.get('name')}")
print(f"Metric:   {state.get('metric')} ({state.get('unit')}) direction={state.get('direction')}")
print(f"Cwd:      {state.get('working_directory')}")
print(f"Started:  {state.get('started_at')}")
print(f"Iter:     {state.get('current_iteration')}")
print(f"Best:     {state.get('best')}")
print(f"Threshold:{state.get('threshold')}")

if not jsonl.exists():
    print("\nNo jsonl yet.")
    sys.exit(0)

rows = []
for line in jsonl.read_text().splitlines():
    line = line.strip()
    if not line: continue
    try: rows.append(json.loads(line))
    except json.JSONDecodeError: pass

baseline = [r["metric"] for r in rows if r.get("role")=="baseline" and isinstance(r.get("metric"),(int,float))]
candidates_by_iter = {}
for r in rows:
    if r.get("role")=="candidate" and isinstance(r.get("metric"),(int,float)):
        candidates_by_iter.setdefault(r["iter"], []).append(r["metric"])

decisions = [r for r in rows if r.get("role")=="decision"]

print(f"\nBaseline samples: {len(baseline)}")
if baseline:
    s = sorted(baseline); n=len(s); med = s[n//2] if n%2 else (s[n//2-1]+s[n//2])/2
    print(f"  median={med:g} min={min(baseline):g} max={max(baseline):g}")

print("\nLast 10 events:")
for r in rows[-10:]:
    role = r.get("role","?")
    if role == "decision":
        c = r.get("confidence") or {}
        print(f"  iter {r.get('iter'):>3} {role:9} {r.get('decision','?'):6} delta={c.get('delta')} conf={(c.get('confidence_pct') or 0)*100:.0f}%")
    else:
        m = r.get("metric"); m = f"{m:g}" if isinstance(m,(int,float)) else "null"
        print(f"  iter {r.get('iter'):>3} {role:9} metric={m} dur={r.get('duration_s',0):.3f}s exit={r.get('exit')}")

if candidates_by_iter:
    print("\nLeaderboard (median per iter):")
    direction = state.get("direction","min")
    by_iter = []
    for it, vs in candidates_by_iter.items():
        s = sorted(vs); n=len(s); med = s[n//2] if n%2 else (s[n//2-1]+s[n//2])/2
        by_iter.append((med, it, len(vs)))
    by_iter.sort(reverse=(direction=="max"))
    for med, it, n in by_iter[:5]:
        print(f"  iter {it:>3}  median={med:g} ({n} samples)")
PY
```

If the user asks for the raw jsonl, point them at `./autoresearch.jsonl`. If they want the cumulative confidence trend, suggest piping it through `jq` themselves — keep this command's output scannable.
