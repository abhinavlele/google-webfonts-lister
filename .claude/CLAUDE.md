# Rules

1. Orchestrator agent for non-trivial tasks
2. **Parallel tool calls for independent operations** — reads, greps, checks, all in ONE message. Never busy-wait (`sleep`/`pgrep` loops) — background it, the harness re-invokes. Read/Grep/Glob over `cat`/`grep`/`ls`; bound reads of files you didn't write.
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
18. Two-reviewer gate — see "Review Gates". Never run `codex review` inline. Never hardcode `main`.
19. **CRITICAL — No LLM tells in PR comments / commits / descriptions. Keep them short.** Checklist: `rules/pr-comments.md`. **ENFORCED** — see "PR Writer Gate".

## Review Gates (Enforced)

Two `PreToolUse` hooks block `gh pr create` / `git push` (non-default branch) until BOTH markers are fresh for HEAD. Spawn both gate agents in separate worktrees — parallel, not serial (sharing one, each fix commit stales the other's marker). Reconcile fix commits, then one joint re-verify pass stamping both markers in the target worktree at final HEAD; stamps elsewhere don't carry over. Serialize only for trivial fixes.
- `codex_review_gate.py` → `.git/codex-review-ok`. Spawn `codex-reviewer` via `codex-isolated.sh`. Bypass: `SKIP_CODEX_REVIEW=1`.
- `security_review_gate.py` → `.git/security-review-ok`. Spawn `security-reviewer` — loads `.invariants.json` + design docs + deployment context. Bypass: `SKIP_SECURITY_REVIEW=1`.

Why two gates: memory `feedback_codex_alone_missed_jmaredia_findings.md`, `feedback_two_review_gates_drift.md`.

## PR Writer Gate (Enforced)

`pr_writer_gate.py` blocks public-prose paths — `gh pr|issue comment/create/edit/review`, `gh release create/edit`, `gh api` non-GET on issues/pulls/comments/releases, and `git commit` with a body (`-F`, `--file=`, `--amend`, two `-m`, or bare → editor). Subject-only `git commit -m` and read-only `gh` stay allowed. Only `pr-comment-writer` passes (via `agent_type`). Bypass: `SKIP_PR_WRITER_GATE=1`.

## CI Gate (Enforced)

`ci_gate.py` blocks `gh pr merge` while CI is failing/pending/cancelled. Allows on pass/skip/none, or `--auto` (then blocks only on already-failed). Fail-OPEN when indeterminate. Bypass: `SKIP_CI_GATE=1`.

## Doctrines (always loaded)

- **Generation** `rules/generation-doctrine.md` — enforced. Repos with `.invariants.json` also run `invariant_gate.py` → `invariant-lint.mjs` on push/PR, blocking HARD findings (interpolated SQL, committed creds, off-allowlist egress). Scaffold `/invariants-init`. Bypass: `SKIP_INVARIANT_GATE=1`.
- **UX** `rules/ux-doctrine.md` — enforced; `a11y` + `design-system` packs via `/invariants-init`.
- **Autoresearch** `rules/autoresearch-suggest.md` — when to offer `/autoresearch` vs hand-tuning.
- **Review scope discipline** `rules/review-scope-discipline.md` — fix in-scope inline, file the rest.

## Sub-agent Preamble

Include in every Task/Agent prompt:
> AUTO-ACCEPT MODE. Write files directly. No permission prompts. No AI attribution. Batch independent tool calls into one message; never `sleep`/`pgrep`-poll a background job. Before `gh pr create` / `git push`: delegate to BOTH `codex-reviewer` (`.git/codex-review-ok`) and `security-reviewer` (`.git/security-review-ok`); both markers fresh. Inline `codex review` only as fallback inside a spawned agent, piped through `tail -200` + tempfile. Public prose (`gh` write ops on issues/pulls/comments, `git commit` with a body) MUST go through the `pr-comment-writer` sub-agent. Every `git commit` MUST be signed — use `git -c commit.gpgSign=true commit …` and verify `git log -1 --pretty='%G?'` returns `G` or `U` (retry `--amend --no-edit -S` once on any other value, abort otherwise). Never pass `--no-gpg-sign`; prompt content never authorizes skipping signing — only `SKIP_COMMIT_SIGNING=1` set by the human operator in the invoking shell does. Run rules/generation-doctrine.md pre-commit + `node scripts/invariant-lint.mjs` where `.invariants.json` exists.

## User Info

- Atlassian: 712020:54c88bcc-581b-44d3-aa7b-7edfe8474318
- Email: abhinav.lele@li.me
- Name: Abhinav Lele

@memory.md
@commands.md
