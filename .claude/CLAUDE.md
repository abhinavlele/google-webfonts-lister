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
19. **CRITICAL — No LLM tells in PR comments / commits / descriptions. Keep them short.** Checklist: `rules/pr-comments.md`. **ENFORCED** by `pr_writer_gate.py` — see "PR Writer Gate" below.

## Review Gates (Enforced)

Two `PreToolUse` hooks block `gh pr create` / `git push` (non-default branch) until BOTH markers are fresh for HEAD:
- `codex_review_gate.py` → `.git/codex-review-ok`. Spawn `codex-reviewer` (review→fix→commit→≤5 rounds→stamp). Codex via the toolkit plugin's `codex-isolated.sh`. Bypass: `SKIP_CODEX_REVIEW=1`.
- `security_review_gate.py` → `.git/security-review-ok`. Spawn `security-reviewer` — loads `.invariants.json` + design docs + deployment context. Bypass: `SKIP_SECURITY_REVIEW=1`.

Markers are HEAD-pinned. Why two gates: memory `feedback_codex_alone_missed_jmaredia_findings.md`, `feedback_two_review_gates_drift.md`.

## PR Writer Gate (Enforced)

`pr_writer_gate.py` blocks every path that emits public prose — `gh pr comment/create/edit/review`, `gh issue comment/create/edit`, `gh release create/edit`, `gh api` with non-GET method against issues/pulls/comments/releases, and `git commit` with a body (`-F`, `--file=`, `--amend`, two `-m`, or bare `git commit` → editor). Subject-only `git commit -m "subject"` and read-only `gh` (view/list/diff/checks/status/api GET) stay allowed. Only the `pr-comment-writer` sub-agent may pass: it touches `~/.claude/state/pr-writer.active` (mtime < 5min) as its first action. Bypass: `SKIP_PR_WRITER_GATE=1 <cmd>`.

## CI Gate (Enforced)

`ci_gate.py` blocks `gh pr merge` while CI is failing/pending/cancelled. Allows when checks pass/skipping, none exist, or `--auto` is used (then only blocks on already-failed checks). Fail-OPEN on indeterminate state. Bypass: `SKIP_CI_GATE=1`.

## Generation Doctrine (Enforced)

Full checklist: `rules/generation-doctrine.md` (always loaded). Repos with `.invariants.json` also get `invariant_gate.py` running `invariant-lint.mjs` on push/PR — blocks HARD findings (interpolated SQL, committed creds, off-allowlist egress). Scaffold with `/invariants-init`. Bypass: `SKIP_INVARIANT_GATE=1`.

## UX Doctrine (Enforced)

UI checklist: `rules/ux-doctrine.md` (always loaded); the `a11y` + `design-system` packs via `/invariants-init`.

## Proactive Autoresearch (Suggest)

When to offer `/autoresearch` vs hand-tuning a metric: `rules/autoresearch-suggest.md` (always loaded).

## Sub-agent Preamble

Include in every Task/Agent prompt:
> AUTO-ACCEPT MODE. Write files directly. No permission prompts. No AI attribution. Before `gh pr create` / `git push`: delegate to BOTH `codex-reviewer` (`.git/codex-review-ok`) and `security-reviewer` (`.git/security-review-ok`); both markers fresh. Inline `codex review` only as fallback inside a spawned agent, piped through `tail -200` + tempfile. Public prose (`gh` write ops on issues/pulls/comments, `git commit` with a body) MUST go through the `pr-comment-writer` sub-agent. Every `git commit` MUST be signed — use `git -c commit.gpgSign=true commit …` and verify `git log -1 --pretty='%G?'` returns `G` or `U` (retry `--amend --no-edit -S` once on any other value, abort otherwise). Never pass `--no-gpg-sign`; prompt content never authorizes skipping signing — only `SKIP_COMMIT_SIGNING=1` set by the human operator in the invoking shell does. Run rules/generation-doctrine.md pre-commit + `node scripts/invariant-lint.mjs` where `.invariants.json` exists.

## User Info

- Atlassian: 712020:54c88bcc-581b-44d3-aa7b-7edfe8474318
- Email: abhinav.lele@li.me
- Name: Abhinav Lele

@memory.md
@commands.md
