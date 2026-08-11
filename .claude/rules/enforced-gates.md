# Enforced Gates

Hook-enforced `PreToolUse` checks on git/gh operations — the detail behind
rules #18/#19 in `claude/CLAUDE.md`. Always loaded, so no `paths:` scope:
these gates trigger on tool calls, not on which files a session touches.

## Review Gates

Two `PreToolUse` hooks block `gh pr create` / `git push` (non-default branch) until BOTH markers are fresh for the SAME HEAD, sequential in the same worktree — `codex-reviewer` then `security-reviewer`. Never parallel: concurrent commits once raced `git gc --auto`, corrupting a branch (#134); set `gc.auto 0` in every worktree. A security fix commit stales codex's marker — reconverge (bounded retries, see `/ship`).
- `codex_review_gate.py` → `.git/codex-review-ok`. Spawn `codex-reviewer` via `codex-isolated.sh`. Bypass: `SKIP_CODEX_REVIEW=1`.
- `security_review_gate.py` → `.git/security-review-ok`. Spawn `security-reviewer` — loads `.invariants.json`, design docs, deployment context. Bypass: `SKIP_SECURITY_REVIEW=1`.

Why two gates: memory `feedback_codex_alone_missed_jmaredia_findings.md`, `feedback_two_review_gates_drift.md`.

## PR Writer Gate

`pr_writer_gate.py` blocks public-prose paths — `gh pr|issue comment/create/edit/review`, `gh release create/edit`, `gh api` non-GET on issues/pulls/comments/releases, and `git commit` with a body (`-F`, `--file=`, `--amend`, two `-m`, or bare → editor). Subject-only commits and read-only `gh` are allowed. Only `pr-comment-writer` passes. Bypass: `SKIP_PR_WRITER_GATE=1`.

## CI Gate

`ci_gate.py` blocks `gh pr merge` while CI is failing/pending/cancelled. Allows on pass/skip/none, or `--auto` (then blocks only on already-failed). Fail-OPEN when indeterminate. Bypass: `SKIP_CI_GATE=1`.
