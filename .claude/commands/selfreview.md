---
name: selfreview
description: Run the deterministic invariant linter, then walk the generation-doctrine Part A adversarial self-review checklist against the current diff. Use before committing any non-trivial change.
---

# Adversarial Self-Review

Run the full generation-doctrine self-review against the current diff (see
`~/.claude/rules/generation-doctrine.md`).

**Scope to review**: $ARGUMENTS (default: the full diff against the default base)

---

## 1. Deterministic pass — invariant-lint

Run the linter (prefer the repo's vendored copy; fall back to the dotfiles copy):

```bash
if [ -f ./scripts/invariant-lint.mjs ]; then
  node ./scripts/invariant-lint.mjs
else
  node ~/.claude/scripts/invariant-lint.mjs
fi
```

(No `--base` needed — the linter defaults to `origin/HEAD` and falls back to
`origin/main` itself. Pass `--base <ref>` only to override; use `--staged`
for an uncommitted diff.)

- Fix every HARD finding before continuing.
- For each WARN, either fix it or state in writing why it is acceptable.

## 2. Semantic pass — doctrine Part A against the diff

Read the actual diff (`git diff origin/HEAD...HEAD`, using `origin/main`
when `origin/HEAD` is unset, or `--staged`) and write
out, item by item:

<selfreview>

### Invariants → enforcement paths (symmetry)
List each invariant the change touches. For each: every code path that must
enforce it, and whether this diff covers ALL of them. An invariant enforced
on N−1 of N paths is enforced on zero.

### Hostile inputs
For every new input/param/header/file name/query value: the hostile value
and the exact file:line where it is rejected.

### Inverse / mirror operations
Each operation's mirror (import↔export, set↔clear, add↔remove,
create↔delete, encode↔decode) and confirmation the mirror gets matching
treatment — or a written justification why it doesn't need it.

### Crash / concurrency / replay
What happens on crash mid-operation, eviction/restart, concurrent
operations, replay/duplicate delivery. Handling or written impossibility
justification for each.

### Literal-spec vs intent
Any place a literal reading of the spec/requirement conflicts with its
stated goal. The goal wins; raise the conflict.

### Invariant-violating tests
For EACH security/data invariant touched: name the test that tries to
violate it. If none exists, write it now — tests encode invariants, not
behavior.

</selfreview>

## 3. Verdict

State clearly: **READY TO COMMIT** (every item answered, lint clean) or
**NOT READY** with the concrete list of gaps to close.
