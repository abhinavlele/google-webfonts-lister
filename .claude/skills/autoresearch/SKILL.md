---
name: autoresearch
description: "Run autonomous optimization experiments. Use when the user wants to iteratively improve a measurable metric (latency, throughput, accuracy, binary size, cost) by editing code → benchmarking → keeping or reverting based on a confidence score. Inspired by pi-autoresearch."
---

# Autoresearch

You're running an experiment loop: hypothesize → edit → benchmark → log → keep-or-revert. Trust the numbers, not your intuition. A change that doesn't beat noise is no change at all.

## Session files (in the project's cwd)

- `autoresearch.md` — frontmatter (name, metric, unit, direction, threshold, baseline_cmd, candidate_cmd, metric_extractor) + your written notes.
- `autoresearch.jsonl` — append-only log of every benchmark run and decision.
- `autoresearch.checks.sh` (optional) — correctness gate. Must exit 0 before each benchmark.

## Tooling (all under `~/.claude/scripts/autoresearch/`)

| Helper          | Purpose                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `init.sh`       | Scaffold session files (called by `/autoresearch`, not by you mid-loop). |
| `run.sh`        | Run a benchmark, parse the metric, append to jsonl.                      |
| `confidence.py` | MAD-based confidence vs. baseline; prints JSON.                          |
| `log.sh`        | Record `keep` (git commit) or `revert` (git stash + drop).               |

## Loop (one iteration)

1. **Read state.** `cat autoresearch.md`. Note frontmatter and the latest hypotheses already tried (don't repeat them).
2. **Establish baseline if missing.** Count baseline rows in `autoresearch.jsonl`:
   ```bash
   jq -c 'select(.role=="baseline")' autoresearch.jsonl | wc -l
   ```
   If fewer than `baseline_samples` (default 5), run baseline samples first:
   ```bash
   ~/.claude/scripts/autoresearch/run.sh baseline 0
   ```
   Repeat until enough samples exist. Do not edit code during baseline collection.
3. **Pick a hypothesis.** Write it under `## Hypotheses` in `autoresearch.md`. Be specific: "Replace O(n²) inner loop in `foo.py:42` with set-based lookup."
4. **Run optional checks pre-edit.** If `autoresearch.checks.sh` exists, run it on baseline to confirm it passes before you change anything.
5. **Edit the code.** Use the `Edit` tool. Touch the minimum surface.
6. **Run checks post-edit.** If `autoresearch.checks.sh` exists, run it. If it fails:
   ```bash
   ~/.claude/scripts/autoresearch/log.sh revert <iter> "checks failed"
   ```
   then go back to step 3 with a different hypothesis.
7. **Run candidate benchmarks.** At least 3 samples for the same `<iter>`:
   ```bash
   for i in 1 2 3; do ~/.claude/scripts/autoresearch/run.sh candidate <iter>; done
   ```
8. **Score.**
   ```bash
   python3 ~/.claude/scripts/autoresearch/confidence.py --iter <iter>
   ```
   Read the JSON. The `decision` field is your default action.
9. **Keep or revert.**
   - `keep`: `~/.claude/scripts/autoresearch/log.sh keep <iter> "<one-line summary>"`
   - `revert`: `~/.claude/scripts/autoresearch/log.sh log.sh revert <iter> "<reason>"`
   On `keep`, the kept version becomes the new baseline-of-record (the `git HEAD`); future candidates are compared to the original baseline samples in the jsonl unless the user runs more `baseline` rows.
10. **Loop.** Pick the next iteration number (max existing `iter` + 1) and go to step 3.

## Decision discipline

- **Direction matters.** If `direction == "min"`, only keep when delta is negative. If `max`, only when positive.
- **Confidence threshold.** Default 0.80 (frontmatter). Below threshold = revert. A real improvement reproduces; noise doesn't.
- **MAD == 0.** If baseline has zero variance, any nonzero delta scores 100% confidence. That's almost certainly an artifact (fixed-time mock, cached result). Investigate before keeping.
- **Failed run.** If a `run.sh` row has `exit != 0` or `metric == null`, treat that iteration as a revert.

## Stopping

Stop when:
- Max iterations reached (when invoked under `/ralph-loop`, the Stop hook handles this).
- User runs `/autoresearch-stop`.
- You've tried ≥3 hypotheses in a row that all reverted — stop and report; the search is exhausted or the metric is too noisy.

To explicitly signal the orchestrating loop you're done, end your message with `<promise>COMPLETE</promise>`.

## Reverts are cheap, regressions are expensive

Prefer to revert and try again than to keep a marginal change. The log captures every attempt — failures are data.
