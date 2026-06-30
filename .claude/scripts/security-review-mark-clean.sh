#!/bin/bash
# Stamp .git/security-review-ok with the current HEAD SHA so the PreToolUse
# security review gate allows the next `gh pr create` / `git push`.
#
# Sibling to codex-review-mark-clean.sh — both markers must be fresh for
# the corresponding gates to clear.
#
# Run this ONLY after the security-reviewer sub-agent has returned `clean`
# (project-aware threat-model review with no findings). Re-stamping is
# required after every new commit, since the marker is HEAD-pinned.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
    echo "error: not inside a git repository" >&2
    exit 1
fi

HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
# `git rev-parse --git-path` resolves the per-worktree git dir, so this works
# whether `.git` is a directory (main repo) or a file (linked worktree).
MARKER_REL="$(git -C "$REPO_ROOT" rev-parse --git-path security-review-ok)"
case "$MARKER_REL" in
    /*) MARKER="$MARKER_REL" ;;
    *)  MARKER="$REPO_ROOT/$MARKER_REL" ;;
esac

printf '%s\n' "$HEAD_SHA" > "$MARKER"
echo "security-review-ok stamped: ${HEAD_SHA:0:12} ($MARKER)"
