---
name: ship
description: Autonomously ship a feature as one or more PR-sized units — decompose, then per unit spawn an Opus implementer sub-agent (AUTO-ACCEPT + generation doctrine + full gate), run the Sonnet codex-reviewer + security-reviewer, adjudicate their output on Opus, open the PR, verify CI/deploy, squash-merge, and clean up. Derived from the proven Fable orchestration loop, on enabled models with deliberate cost tiering.
---

# /ship — autonomous PR-by-PR delivery

Ship `$ARGUMENTS` end to end. This command IS the orchestrator for delivery —
do not delegate to the `orchestrator` agent (that would just nest the same
loop). You (the main loop, Opus) drive; the heavy work fans out to sub-agents
with explicit model routing.

**Model routing (the whole point — autonomy + quality, cheaper than Fable):**
- Planning deliberation → `deliberate-analyst` (Opus), *conditionally* (below).
- Each PR implementer → `general-purpose` (Opus) — quality where it pays.
- `codex-reviewer` (Sonnet) — cheap, mechanical: runs `codex`, fixes, stamps `.git/codex-review-ok`.
- `security-reviewer` (Sonnet) — threat-model gate: auth/authz, secrets, egress, stamps `.git/security-review-ok`.
- **Adjudication of both reviewers' output → you, Opus** — a strong model signs off on
  what the cheap loops produced, without raw output entering context.

**Flags** (parse from `$ARGUMENTS`):
- `--plan-only` — decompose and print the plan; build nothing.
- `--no-merge` — stop at "PR open"; the user reviews/merges.
- `--solo` — trivial change: do it yourself in the main loop, skip delegation,
  but still run the full gate + codex gate before the PR.

---

## Phase 0 — Scope & deliberate (conditional)

Read the request and inspect the repo. Decide the unit breakdown.

**Invoke `deliberate-analyst` first IF** the request is ambiguous, touches an
architectural decision, spans >3 files, or is clearly multiple PRs (rule #13).
Otherwise skip straight to building. The deliberation produces the PR
breakdown, surfaces assumptions, and names the irreversible/ambiguous forks.

Surface any genuinely irreversible or ambiguous fork to the user now (e.g.
"hard delete vs soft archive", a destructive migration) — these are the only
decisions that are theirs, not yours. Pick sensible defaults for everything
else and proceed. Do NOT ask "should I proceed?".

Emit the plan as an ordered list of PR-sized units. On `--plan-only`, stop here.

## Phase 1 — Per unit, in order

For each unit, run this loop. Units are sequential by default (later units may
depend on earlier merges); only parallelize independent units, each in its own
worktree.

### 1a. Worktree
Create a fresh worktree off the latest default branch:
```bash
# Use an explicit refspec so the origin/<default> remote-tracking ref is
# actually updated — a bare `git fetch origin <default>` only moves FETCH_HEAD
# and can leave origin/<default> stale, branching the worktree off old code.
git fetch origin <default>:refs/remotes/origin/<default> -q
git worktree add ../<repo>-wt-<slug> -b <type>/<slug> origin/<default>
```
Detect `<default>` via `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
Never work in the main checkout; never `git checkout` to switch branches.

### 1b. Implementer sub-agent (Opus)
Spawn a `general-purpose` agent with `model: opus`. Its prompt MUST include:
> AUTO-ACCEPT MODE. Write files directly. Execute immediately. No permission
> prompts. No AI attribution anywhere. Work in worktree `<path>` on branch
> `<branch>`. Implement: `<unit spec>`.
> Engineering bar: extract pure logic into testable helpers; write
> invariant-VIOLATING tests (not just happy paths) for every security/data
> invariant; run the FULL gate and make it pass — typecheck, lint, unit tests,
> build, and e2e if the repo has it. Before committing, complete the
> generation-doctrine Part A self-review (symmetry / hostile-input / mirror-ops
> / crash-replay / literal-vs-intent / tests-encode-invariants) and, in repos
> with `.invariants.json`, ensure `node scripts/invariant-lint.mjs` passes.
> Commit with a clear message. Do NOT push or open a PR. Return a concise
> summary: what changed, the gate results, and any residual risk.

If the implementer reports a gate it cannot make pass, do not proceed — fix it
yourself or surface it to the user. Never ship red.

Once the implementer is done and before spawning codex-reviewer, record the
implementer's final commit so step 1d can isolate the codex fix diff:
```bash
IMPL_SHA=$(git -C <worktree> rev-parse HEAD)   # last implementer commit
```

### 1c. Codex review (Sonnet) — the mechanical loop
Spawn the `codex-reviewer` agent (it is pinned to Sonnet). Give it the worktree
path and detected base. It runs `codex review`, applies fixes, commits, and
stamps `.git/codex-review-ok`, returning a single one-line outcome
(`clean`/`failed`/`blocked`). By design it does NOT summarize findings — its
hard rule is to keep review output out of the parent context, so do not ask it
to; you adjudicate from its fix commits in step 1d instead. It must not push or
open a PR.

On `failed`/`blocked`, surface to the user — do not bypass without approval.

### 1c2. Security review (Sonnet) — the threat-model gate
After codex-reviewer stamps `.git/codex-review-ok`, spawn the `security-reviewer`
agent. Give it the worktree path and detected base. It reviews the threat-model
dimensions (auth/authz, secret/PII leakage, egress, mirror-ops, test-integrity,
PR-doctrine), applies fixes, commits, and stamps `.git/security-review-ok`,
returning a single one-line outcome. Both markers must be present for the push
gate to pass; running security-reviewer before `git push` is mandatory.

On `failed`/`blocked`, surface to the user — do not bypass without approval.

### 1d. Adjudicate both reviewers' output (you, Opus)
After both reviewers return `clean`, do NOT blindly trust them. Review:
```bash
git -C <worktree> log --oneline origin/<default>..HEAD
git -C <worktree> diff "$IMPL_SHA"..HEAD   # the review-fix commits (SHA from 1b)
```
Judge: are the fixes correct and complete? Did either reviewer flag a false
positive that got "fixed" wrongly, or miss something the diff still has? If any
fix is unsound, send the relevant reviewer back with specifics, or correct it
yourself and re-run that gate. Only proceed when you, on Opus, are satisfied.

### 1e. PR → verify → merge → clean up
Both gate markers (`codex-review-ok` and `security-review-ok`) are per-worktree
(stamped in the linked worktree's git dir), so run BOTH the push and the PR
creation from inside `<worktree>` — the review-gate hooks check the markers in
the invoking checkout's git dir, and from the main checkout they would not see
the worktree's markers and would block:
```bash
git -C <worktree> push -u origin <branch>
( cd <worktree> && gh pr create --base <default> --head <branch> --title "…" --body "…" )
```
**CI must be watched, not assumed.** `gh pr create` returns as soon as GitHub
accepts the branch, before any check has run — the CLI has no webhook signal
that would tell you a check failed later, so you MUST poll or the failure is
invisible until the next `gh pr checks` invocation:
```bash
gh pr checks <n> --watch --fail-fast --interval 10
```
`--watch` blocks until every check finishes; `--fail-fast` returns non-zero
the moment any check fails (so you don't wait 20 minutes for a 30-second lint
failure); `--interval 10` polls every 10s. Do this on `--no-merge` too — the
point of a PR is that CI ran, not that it exists. If checks fail, inspect
the failed logs (`gh run view <run-id> --log-failed`), fix in the worktree,
spawn the reviewers again to re-stamp, and re-push. Do NOT report the PR as
"shipped" until CI is green (or explicitly-approved-red on `--no-merge`).

On green, `gh pr merge <n> --squash`. On `--no-merge`, stop here.
After merge: remove the worktree, delete the local + remote branch, and
fast-forward the local default branch. Phase 1 never switches the main
checkout, so do NOT `merge` into whatever it currently has out — fetch directly
into the `<default>` ref instead. `git fetch origin <default>:<default>`
fast-forwards the local `<default>` branch when it is not the checked-out
branch and refuses a non-fast-forward, so it can never clobber an unrelated
branch:
```bash
git worktree remove <path> --force
git branch -D <branch>; git push origin --delete <branch>
# If <main> happens to have <default> checked out, fetching into the current
# branch is rejected; in that case run the merge form instead.
if [ "$(git -C <main> symbolic-ref --quiet --short HEAD)" = "<default>" ]; then
  git -C <main> fetch origin <default>:refs/remotes/origin/<default> -q \
    && git -C <main> merge --ff-only origin/<default>
else
  git -C <main> fetch origin <default>:<default> -q
fi
```

## Phase 2 — Summary

Report: each unit's PR number + state, what shipped, any deploy-verification
result, and anything you could not auto-resolve. Be honest — if a gate was
skipped or a check is still pending, say so.

---

## Why this shape

This is the loop that built the project on Fable (main loop orchestrating;
per-PR implementer sub-agents with an AUTO-ACCEPT preamble; codex-reviewer
gate), with the engine reassigned: Opus where capability pays (implement +
adjudicate), Sonnet for the mechanical review loops. Quality comes from the gates
(self-review → codex → security → Opus adjudication → CI/deploy), not the model
— so it reproduces the autonomy and quality at lower cost than Fable.
