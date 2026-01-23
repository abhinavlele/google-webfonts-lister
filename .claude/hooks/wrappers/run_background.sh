#!/bin/bash
# Generic wrapper to run a Python hook in the background
# Usage: run_background.sh <python_hook_path>
#
# This wrapper:
# 1. Captures stdin to a temp file
# 2. Spawns the Python hook as a background process using venv Python
# 3. Exits immediately (non-blocking)
#
# Note: Background hooks cannot block or provide feedback to Claude.
# Only use this for tracking/logging hooks.

HOOK_SCRIPT="$1"
HOOK_NAME=$(basename "$HOOK_SCRIPT" .py)

# Use venv Python if available (has langfuse installed)
VENV_PYTHON="$HOME/.claude/hooks/.venv/bin/python3"
if [[ -x "$VENV_PYTHON" ]]; then
    PYTHON="$VENV_PYTHON"
elif [[ -x ".claude/hooks/.venv/bin/python3" ]]; then
    # Fallback to relative path for synced projects without global install
    PYTHON=".claude/hooks/.venv/bin/python3"
else
    PYTHON="python3"
fi

# Create temp file for input
TMPFILE=$(mktemp "/tmp/claude_hook_${HOOK_NAME}_XXXXXX.json")

# Capture stdin
cat > "$TMPFILE"

# Fully detach the hook process so it doesn't block Claude exit
# Uses double-fork pattern for daemon-style detachment (works on macOS/Linux)
# - First subshell backgrounds and exits immediately
# - Second subshell runs the actual work, fully orphaned
# - nohup: Survives parent exit (SIGHUP immunity)
# - Redirect all fds to /dev/null to prevent blocking
(
    (
        nohup "$PYTHON" "$HOOK_SCRIPT" < "$TMPFILE" >/dev/null 2>&1
        rm -f "$TMPFILE"
    ) &
) &

# Exit immediately
exit 0
