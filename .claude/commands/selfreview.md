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

## 2a. Rule-edit pass — invariant-rule meta-review (only if the diff touches `.invariants.json`, `.invariants/**`, `scripts/invariant-lint.mjs`, `claude/invariants/**`, or `claude/scripts/invariant-lint.mjs`)

If the diff modifies invariant rules OR the linter, the rules
themselves are the code — a bypassable rule is worse than no rule
because it manufactures false confidence in every future review round.
Skip this section if the diff does not touch those paths (repo-local or dotfiles-global); otherwise
write out, item by item:

<invariantreview>

### Bypass enumeration
For each added or modified regex rule: three plausible shapes that
*should* trigger it. Confirm each matches the `pattern` (run
`node scripts/invariant-lint.mjs` for repo-local rules, or
`node claude/scripts/invariant-lint.mjs` for dotfiles-global rules,
against a fixture / pre-fix SHA that contains them). Include semantic siblings — if the rule fires
on `if v, ok := ...; ok {`, does it also catch the two-line form
`v, ok := ...` / `if ok {`? Missed shapes go into `pattern` or into
the rule's `//` comment as a documented gap with a doctrine backstop.

### safePattern hygiene
For each rule with a `safePattern`: does it match CODE (function
call, field access, import) or bare prose? A safePattern like
`"DEPLOY_ENV"` is unsound — a doc comment `// DEPLOY_ENV is loaded
separately` in the lookbehind window would silently suppress the
finding. Same for `pattern`: bare words that also appear in variable
names, log strings, or doc comments will false-positive.

### Doctrine reconciliation
If the PR body / commit message cites a source list of findings the
rules encode (e.g. "encodes M1..M6 from review X"), count the
doctrine bullets + regex rules and confirm each source finding has
AT LEAST ONE landing spot. A finding cited by name with no rule and
no doctrine bullet is a gap.

### Include/exclude symmetry
Are the `include` globs narrow enough to avoid firing on unrelated
files AND broad enough to cover every code path where the invariant
matters? A rule including only `internal/store/**` when the
invariant also applies to `internal/handler/**` is enforced on N−1
of N paths.

### Rule test coverage
For each new regex rule: name the fixture (a pre-fix commit SHA
cited in the PR body, or a `.invariants-tests/` sample) that proves
the rule fires. A rule landed without a positive-case fixture is
prose, not enforcement.

### Linter behavior changes (only when the diff touches `scripts/invariant-lint.mjs` or `claude/scripts/invariant-lint.mjs`)
Even if no regex rule changed, a linter-only diff can silently alter
enforcement. Walk these:
- **New code path added:** does it handle all rule types the existing
  code handles (regex, `safePattern`, include/exclude, severity
  escalation)? An unhandled type passes silently.
- **Existing code path changed:** identify which rule types and
  findings are affected. For each, state the before/after behavior —
  "was hard-STOP, now WARN" is a severity downgrade, not a cleanup.
- **Bypass surface:** does the change add or widen any CLI flag,
  env-var, or config key that can suppress findings? Each new bypass
  must have a matching CI guard or a written justification.
- **Exit-code contract:** the linter exits non-zero on HARD findings.
  Confirm the change does not alter that contract for any existing
  HARD rule.

</invariantreview>

## 2b. UX pass — ux-doctrine (only if the diff touches a user interface)

If the diff changes any UI (`.tsx`/`.jsx`/`.vue`/`.svelte`/`.html`/`.erb`
templates, components, styles), also walk
`~/.claude/rules/ux-doctrine.md` Part A against it and write out, item by
item — skip this section entirely for non-UI diffs:

<uxreview>

### Every state, not just the happy one
For each new/changed view: are empty, loading, error, partial, and success
states each designed (not defaulted)? Name any that are missing.

### Keyboard & screen-reader path
For each interactive element added: how a keyboard-only user reaches and
operates it (tab order, visible focus, accessible name, Enter/Space). Custom
controls: their `role` and the keys handled, plus focus movement after the
action.

### Real data, not mock data
What happens at the boundaries the mock hid: longest string, zero/one/many
items, missing image, RTL/accented locale, narrowest/widest viewport.

### Feedback & reversibility
Every mutating action: its immediate feedback, and for destructive actions a
confirm or undo. Double-submission guarded.

### Consistency & copy
Reuses existing components/tokens (not one-off literals — the `design-system`
WARNs above are the mechanical signal). User-facing copy is in the user's
language, localized, with no raw codes / `undefined` / `NaN` leaking.

</uxreview>

## 3. Verdict

State clearly: **READY TO COMMIT** (every item answered, lint clean) or
**NOT READY** with the concrete list of gaps to close.
