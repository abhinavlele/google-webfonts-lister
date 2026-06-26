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
19. **CRITICAL — No LLM tells in PR comments / commits / descriptions.** Write as if a human typed it. Checklist: `rules/pr-comments.md`. No future-action announcements, no Fixed/Discussed/Pending bullet structure, no sycophantic openings, no multi-paragraph essays — short, specific, lead with substance.

## Codex Review Gate (Enforced)

A `PreToolUse` hook (`~/.claude/hooks/codex_review_gate.py`) **blocks** `gh pr create` and `git push` (when not on the repo default branch) until a fresh review marker exists for the current `HEAD` SHA. Marker is HEAD-pinned: any new commit invalidates it.

When blocked: spawn the `codex-reviewer` sub-agent (review → fix → commit → repeat ≤5 rounds → stamp `.git/codex-review-ok`). On `clean`, retry. On `failed`/`blocked`, surface to user. Bypass with `SKIP_CODEX_REVIEW=1 <cmd>` sparingly. Codex runs via `~/.claude/scripts/codex-isolated.sh` (fresh empty `HOME`) so `~/.codex` session store can't replay another repo's cached scan.

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
