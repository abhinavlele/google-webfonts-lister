# Rules

1. Orchestrator agent for non-trivial tasks
2. Parallel tool calls for independent operations
3. Use `gh` for all GitHub operations
4. No AI attribution anywhere (commits, PRs, comments, code, no Co-Authored-By)
5. Prefer established libraries over custom code
6. Sub-agents: Write tool directly, no heredocs, no permission prompts
7. No "Should I proceed?" / "Would you like me to..." — just execute
8. POODR principles (Sandi Metz): SRP, dependency injection, duck typing, tell don't ask
9. All changes must pass tests + linters + security review
10. PR-only workflow, never push to main/master
11. No `rm -rf` without confirmation; prefer targeted deletions
12. No heredocs for file creation (`cat << EOF`, `python3 << SCRIPT`)
13. Deliberate before acting on >3 files or architectural decisions
14. XML tags for structured multi-step analysis
15. Checkpoint verification after each phase of multi-step work
16. Surface assumptions explicitly — ask "What if this is wrong?"
17. Git worktrees only, never `git checkout` for branch switching
18. Codex review before any PR create or push: detect base branch (`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`), run `codex review --base <detected>`, fix findings in a loop (max 5 iterations) until clean. Never hardcode `main`. Applies to all agents.

## Codex Review Gate (Enforced)

A `PreToolUse` hook (`~/.claude/hooks/codex_review_gate.py`, registered for `Bash` in `settings.merged.json`) **blocks** `gh pr create ...` and `git push ...` (when the current branch is not the repo default) until a fresh review marker exists for the current `HEAD` SHA.

Workflow when blocked:
1. Detect base: `BASE=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)`
2. `codex review --base "$BASE"`
3. Fix all findings, commit, repeat (max 5 rounds) until clean
4. Stamp the marker: `~/.claude/scripts/codex-review-mark-clean.sh` (writes `.git/codex-review-ok` with the current HEAD SHA)
5. Retry the original `gh pr create` / `git push`

The marker is HEAD-pinned: any new commit invalidates it and forces a fresh review. Bypass a single command only with `SKIP_CODEX_REVIEW=1 <command>` (use sparingly, e.g. emergency revert of a broken main).

## Sub-agent Preamble

Include in every Task/Agent prompt:
> AUTO-ACCEPT MODE. Write files directly. Execute immediately. No permission prompts. No AI attribution. CODEX REVIEW: Before `gh pr create` or `git push` to a PR branch, detect base with `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`, then run `codex review --base <detected>` and fix all findings until clean (max 5 rounds). After clean, stamp the marker with `~/.claude/scripts/codex-review-mark-clean.sh` (the PreToolUse gate blocks `gh pr create` / `git push` until the marker matches HEAD).

## User Info

- Atlassian: 712020:54c88bcc-581b-44d3-aa7b-7edfe8474318
- Email: abhinav.lele@li.me
- Name: Abhinav Lele

@memory.md
@commands.md
