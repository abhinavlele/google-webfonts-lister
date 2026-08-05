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
