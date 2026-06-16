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
18. Codex review before any PR create or push: delegate to the `codex-reviewer` sub-agent, which runs the loop (detect base via `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`, `codex review --base <detected>`, fix, commit, stamp) in isolation and returns a one-line status. Never run `codex review` inline from the main thread — the review output blows the context budget. Never hardcode `main`. Applies to all agents.

## Codex Review Gate (Enforced)

A `PreToolUse` hook (`~/.claude/hooks/codex_review_gate.py`, registered for `Bash` in `settings.merged.json`) **blocks** `gh pr create ...` and `git push ...` (when the current branch is not the repo default) until a fresh review marker exists for the current `HEAD` SHA.

Workflow when blocked: spawn the `codex-reviewer` sub-agent with the target repo dir and detected base branch. The sub-agent does the entire loop (review → fix → commit → repeat ≤5 rounds → stamp `.git/codex-review-ok`) in its own context and reports back `clean: ...` / `failed: ...` / `blocked: ...` in one line. On `clean`, retry the original `gh pr create` / `git push`. On `failed` / `blocked`, surface to the user — do not bypass without explicit approval.

Why the sub-agent: codex review output is large (full diff analysis, all findings) and we run it up to 5 times. Running inline pushes the main conversation past 100% context. The sub-agent isolates that output entirely.

The marker is HEAD-pinned: any new commit invalidates it and forces a fresh review. Bypass for a single command with `SKIP_CODEX_REVIEW=1 <cmd>` (use sparingly, e.g. emergency revert of a broken main).

The `codex-reviewer` sub-agent runs codex via `~/.claude/scripts/codex-isolated.sh` (fresh empty `HOME` per call) so codex's `~/.codex` session store — which `CODEX_HOME` does not govern — can't replay another repo's cached scan; it also checks the review `workdir:` and falls back to isolated `codex exec` on a replay.

## Generation Doctrine (Enforced)

Full adversarial self-review checklist: `rules/generation-doctrine.md` (always loaded). Before committing, check symmetry (every enforcement path), hostile inputs, mirror ops (import↔export, create↔delete), crash/replay, literal-vs-intent, and a violating test per security/data invariant. `/selfreview` walks it against the diff.

Repos with a `.invariants.json` also get a `PreToolUse` gate (`invariant_gate.py`) running `invariant-lint.mjs` on push/PR that **blocks** HARD findings (interpolated SQL, committed creds, off-allowlist egress). Scaffold with `/invariants-init`; bypass with `SKIP_INVARIANT_GATE=1 <cmd>`.

## UX Doctrine (Enforced)

UI checklist: `rules/ux-doctrine.md` (always loaded); the `a11y` + `design-system` packs via `/invariants-init`.

## Proactive Autoresearch (Suggest)

When to offer `/autoresearch` vs hand-tuning a metric: `rules/autoresearch-suggest.md` (always loaded).

## Sub-agent Preamble

Include in every Task/Agent prompt:
> AUTO-ACCEPT MODE. Write files directly. Execute immediately. No permission prompts. No AI attribution. CODEX REVIEW: Before `gh pr create` or `git push` to a PR branch, delegate the review-and-fix loop to the `codex-reviewer` sub-agent (it detects the base branch, runs `codex review`, fixes findings, commits, and stamps `.git/codex-review-ok`). Only run `codex review` inline as a manual fallback if you are already inside an agent and cannot spawn another — pipe codex output through `tail -200` and a tempfile so it never enters your context. Before committing, complete the adversarial self-review in rules/generation-doctrine.md (symmetry / hostile-input / mirror-ops / crash-replay / tests-encode-invariants) and, in repos with .invariants.json, ensure `node scripts/invariant-lint.mjs` passes.

## User Info

- Atlassian: 712020:54c88bcc-581b-44d3-aa7b-7edfe8474318
- Email: abhinav.lele@li.me
- Name: Abhinav Lele

@memory.md
@commands.md
