---
name: autoresearch
description: Start an autoresearch optimization session — iteratively edit code, benchmark, keep-or-revert based on MAD confidence. Optionally drives an autonomous loop via /ralph-loop.
---

# /autoresearch

Initialize and (optionally) drive an autoresearch session in the current project.

## Arguments received

`$ARGUMENTS`

## Argument format

```
/autoresearch <name> --metric <name> --unit <unit> --direction <min|max>
              [--baseline-cmd "<cmd>"] [--candidate-cmd "<cmd>"]
              [--metric-extractor <regex>] [--threshold <0..1>]
              [--baseline-samples <N>] [--max-iterations <N>]
              [--no-loop]
```

Examples:

```
/autoresearch latency-opt --metric latency --unit ms --direction min \
  --baseline-cmd "npm run bench:baseline" --candidate-cmd "npm run bench" \
  --max-iterations 20

/autoresearch model-acc --metric accuracy --unit % --direction max \
  --candidate-cmd "python eval.py" --threshold 0.9 --no-loop
```

## What this command does

1. **Parse the arguments** above (name + flags).
2. **Prompt for missing required args.** If `<name>`, `--metric`, `--unit`, or `--direction` is missing or empty, use `AskUserQuestion` to collect them. One question per missing arg, in this order:
   - `name` — short identifier (free text via "Other")
   - `metric` — what's being measured (free text via "Other"; suggest options: `latency`, `throughput`, `accuracy`, `cost`, `binary_size`)
   - `unit` — unit of the metric (free text via "Other"; suggest: `ms`, `s`, `req/s`, `%`, `MB`, `$`)
   - `direction` — `min` or `max` (two-option select)

   Optional args (`--baseline-cmd`, `--candidate-cmd`, `--threshold`, `--max-iterations`, `--no-loop`) are NOT prompted — they have sensible defaults or can be set later in `autoresearch.md`.
3. **Run the initializer** to scaffold session files in cwd:
   ```bash
   ~/.claude/scripts/autoresearch/init.sh "<name>" --metric "<m>" --unit "<u>" \
       --direction <min|max> [--baseline-cmd ...] [--candidate-cmd ...] \
       [--metric-extractor ...] [--threshold ...] [--baseline-samples ...]
   ```
   This refuses to start in a dirty git tree; if it fails, surface the error and stop.
4. **Confirm what was created** (read `autoresearch.md` and quote the frontmatter).
5. **Decide loop mode:**
   - If `--no-loop` is passed, stop here. Tell the user to invoke the `autoresearch-runner` agent (or follow the `autoresearch` skill) for each iteration manually.
   - Otherwise, hand off to `/ralph-loop` so iterations + cancellation come for free. Use the prompt template below. **Always pass `--max-iterations`** — default to 10 if unspecified; do not prompt for it.

## Ralph loop hand-off

Construct and invoke `/ralph-loop` with this prompt (substitute `<...>` placeholders):

```
You are running iteration <N> of an autoresearch session named "<name>".

Follow the `autoresearch` skill workflow:
  ~/.claude/skills/autoresearch/SKILL.md

Before each iteration, prefer to delegate one full iteration to the
`autoresearch-runner` agent so the main context stays clean.

Stop when any of:
  - confidence has plateaued for 3 consecutive iterations (all reverts),
  - you've exhausted hypotheses,
  - max iterations reached.

When done, run /autoresearch-stop and emit <promise>COMPLETE</promise>.
```

Pass `--max-iterations <N>` and `--completion-promise COMPLETE` to `/ralph-loop`.

## Safety reminders

- `init.sh` refuses to run in a dirty work tree — that's intentional. Don't bypass it.
- Reverts use `git stash push -u && stash drop`, which is reflog-recoverable for ~30 days but not visible in `git log`. Warn the user if the project relies on tracked-only state.
- `--max-iterations` is your primary safety mechanism for the loop mode. Default to 10 if unspecified.
