# Bash Command Safety

## Safe Patterns
- Redirect stderr: `command 2>&1 | head -20`
- Check before delete: `ls -la target_dir/` then `rm specific_file.txt`
- Timeout long commands: `timeout 30s ./script.sh`
- Use absolute paths instead of `cd && command`

## Avoid
- `rm -rf` without explicit user confirmation
- Unbounded output (always pipe to `head` or `tail`)
- Heredocs for file creation (use Write tool)
- `python3 << 'SCRIPT'` patterns (use Write tool + execute)
- Process termination (`pkill`, `kill -9`) without confirmation
- Compound bash: never chain `cd && git` — use `-C` flag or absolute paths.
  Compound commands also trip the permission classifier ("this command contains
  multiple operations"), turning a free call into a blocking prompt.

## Don't shell out to read files

Use `Read`, `Grep`, and `Glob` instead of `cat`, `grep`, `rg`, `find`, `ls`,
`head`, `tail`, `wc`. Measured across prior sessions: 164 `Read` calls totalled
**11.6 seconds**, while 94 `grep` + 74 `wc` + 56 `ls` + 35 `cat` Bash calls
totalled **56.4 minutes**. The native tools also skip the hook and permission
overhead every Bash call pays. Reserve Bash for what needs a shell — git, gh,
test runners, build tools, linters.

Bound every read of a file you did not write: `Read` with `offset`+`limit`, or
`tail -n 200`. A single unbounded `Read` of a codex log pulled 794 KB into
context in a prior session.

## Never busy-wait

No `sleep` loops — and no bare `sleep <N>` to wait a job out either. One long
sleep burns exactly the wall-clock a loop does; it just satisfies the letter of
this rule while defeating it. No `until ! pgrep …; do sleep 15; done`, `while
kill -0 $PID`, or `ps -p $PID` polling. Long-running work goes to Bash with
`run_in_background: true` — the harness re-invokes you when the process exits,
so polling learns nothing you weren't about to be told. Enforce time limits with
`timeout <seconds> <cmd>` (from GNU coreutils; exits `124`, and `--kill-after`
escalates to SIGKILL). Never hand-roll a watchdog out of `sleep`, `wait`, and
`kill` — that is concurrent signal handling, it is much harder than it looks,
and `timeout` has done it correctly for decades. On macOS coreutils installs
as `gtimeout`; `install.sh` requires it at bootstrap, so prefer `timeout`,
fall back to `gtimeout`. Don't enforce timeouts by counting your own sleeps.

This is the single largest measured time sink: **201 polling-style calls, 168.6
minutes, 55% of all Bash wall-clock.**

## A process check must never match its own argv

`pgrep -f <pattern>` matches the FULL command line, and the Bash tool wraps
what you run in `sh -c '<the whole string>'` — so the pattern is sitting in the
watcher's own argv. `until ! pgrep -f 'codex-isolated.sh review'; do sleep 20;
done` therefore matches itself and waits forever. This is not hypothetical: it
wedged a review for 12.5 hours before a human noticed (#137).

In order of preference:

1. Don't wait at all — background the job and let re-invocation-on-exit handle
   it. This removes the check rather than fixing it.
2. If a liveness check is genuinely needed, identify the process by `$!` (the
   shell's own last-background-PID) or a pidfile — never by pattern.
3. If a pattern is unavoidable, it must be a string that provably cannot appear
   in the watcher's own command line, and the check must explicitly exclude
   `$$`. The same trap is why `ps | grep` idioms carry `grep -v grep`; treat
   that as evidence the shape is wrong, not as the fix.

Same rule for a script that inspects `ps` output: snapshot first, match the
pattern afterwards, so the searching process cannot be in what was captured.
