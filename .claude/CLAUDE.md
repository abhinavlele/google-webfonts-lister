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
18. Two-reviewer gate before any PR create or push: delegate to BOTH `codex-reviewer` (local correctness) and `security-reviewer` (project-aware threat-model) sub-agents. Independent markers `codex-review-ok` + `security-review-ok`, both must be fresh for HEAD. Never run `codex review` inline. Never hardcode `main`.
19. **CRITICAL — No LLM tells in PR comments / commits / descriptions. Keep them short.** Commit body ≤ 3 sentences. PR / review comments ≤ 3 sentences unless a tradeoff needs explaining. No future-action announcements, no Fixed/Discussed/Pending bullet structure, no sycophantic openings, no multi-paragraph essays. Checklist: `rules/pr-comments.md`.

## Review Gates (Enforced)

Two sibling `PreToolUse` hooks block `gh pr create` and `git push` (non-default branch) until BOTH markers are fresh for HEAD:

- `codex_review_gate.py` → marker `.git/codex-review-ok`. Spawn the `codex-reviewer` sub-agent (review → fix → commit → ≤5 rounds → stamp). Codex runs via `~/.claude/scripts/codex-isolated.sh` (fresh empty HOME, prevents `~/.codex` session-store replay). Bypass: `SKIP_CODEX_REVIEW=1 <cmd>`.
- `security_review_gate.py` → marker `.git/security-review-ok`. Spawn the `security-reviewer` sub-agent — loads the repo's `.invariants.json` + design docs + deployment context, reviews against project-aware threat-model dimensions. Bypass: `SKIP_SECURITY_REVIEW=1 <cmd>`.

Both reviewers return `clean: marker stamped at <sha>; dimensions=<list>`. Markers are HEAD-pinned — any new commit invalidates them.

Why two gates / the duplication tech-debt / past misses are in the memory notes `feedback_codex_alone_missed_jmaredia_findings.md` and `feedback_two_review_gates_drift.md`.

## CI Gate (Enforced)

A `PreToolUse` hook (`~/.claude/hooks/ci_gate.py`) **blocks** `gh pr merge` while the target PR's CI is failing/pending/cancelled — never merge on red or unfinished CI. Allows when all checks pass/skipping, none exist, or `--auto` is used (it then blocks only on already-failed checks). Fail-OPEN on an indeterminate state so it can't deadlock. When blocked, wait for green (`gh pr checks --watch`) or fix failures, then retry. Bypass sparingly: `SKIP_CI_GATE=1 <cmd>`.

## Generation Doctrine (Enforced)

Full adversarial self-review checklist: `rules/generation-doctrine.md` (always loaded). Before committing, check symmetry (every enforcement path), hostile inputs, mirror ops (import↔export, create↔delete), crash/replay, literal-vs-intent, and a violating test per security/data invariant. `/selfreview` walks it against the diff.

Repos with a `.invariants.json` also get a `PreToolUse` gate (`invariant_gate.py`) running `invariant-lint.mjs` on push/PR that **blocks** HARD findings (interpolated SQL, committed creds, off-allowlist egress). Scaffold with `/invariants-init`; bypass with `SKIP_INVARIANT_GATE=1 <cmd>`.

## UX Doctrine (Enforced)

UI checklist: `rules/ux-doctrine.md` (always loaded); the `a11y` + `design-system` packs via `/invariants-init`.

## Proactive Autoresearch (Suggest)

When to offer `/autoresearch` vs hand-tuning a metric: `rules/autoresearch-suggest.md` (always loaded).

## Sub-agent Preamble

Include in every Task/Agent prompt:
> AUTO-ACCEPT MODE. Write files directly. No permission prompts. No AI attribution. Before `gh pr create` / `git push`: delegate to BOTH `codex-reviewer` (stamps `.git/codex-review-ok`) and `security-reviewer` (stamps `.git/security-review-ok`); both markers must be fresh. Inline `codex review` only as fallback inside an already-spawned agent, piped through `tail -200` + tempfile. Run rules/generation-doctrine.md self-review pre-commit and `node scripts/invariant-lint.mjs` where `.invariants.json` exists.

## User Info

- Atlassian: 712020:54c88bcc-581b-44d3-aa7b-7edfe8474318
- Email: abhinav.lele@li.me
- Name: Abhinav Lele

@memory.md
@commands.md
