# Generation Doctrine — Adversarial Self-Review

Standing doctrine for every implementation pass, in every repo. The same
failure classes recur and are only caught by external review: symmetry
blindness, literal-spec over intent, happy-path only, tests that confirm
behavior rather than attack invariants.

The deterministic complement is `invariant-lint.mjs` (toolkit plugin
`scripts/`), opt-in per repo via `.invariants.json`: `"extends"` composes
catalog rule-packs, parameters, and repo-local `rules`.
`/invariants-init` scaffolds it, vendoring the linter. Run `/selfreview`
before committing.

## Part A — Adversarial self-review checklist (complete BEFORE committing)

Write out, per change (PR description, commit message, or working notes —
somewhere reviewable):

1. **Invariants and enforcement paths (symmetry).** Enumerate the
   invariants this change must uphold, and for each name EVERY code path
   that must enforce it — not just the one you touched. N−1 of N paths
   enforced is zero enforced.
2. **Hostile inputs.** For every new input, parameter, header, file name, or
   query value: state the hostile value (`../../etc/passwd`, a 10 MB string,
   another tenant's id) and name the exact line rejecting it. "It can't
   happen" is not a rejection site.
3. **Inverse / mirror operations.** Identify each operation's inverse —
   import ↔ export, add ↔ remove, encode ↔ decode, serialize ↔ parse — and
   confirm it gets the same validation, containment, and auth. If you
   hardened one direction, justify why the other doesn't need it too.
4. **Failure, concurrency, replay.** What happens on crash mid-op,
   eviction/restart, concurrent ops, or replay/duplicate delivery? Each
   gets handling or a written justification — not silence.
5. **Literal-spec vs intent.** Flag any literal reading of the spec that
   conflicts with a stated goal. The goal wins; raise the conflict — never
   silently implement the letter against the spirit.
6. **Invariant-violating tests.** For each security/data invariant touched,
   write one test that TRIES TO VIOLATE it — inject through the new
   parameter, smuggle a traversal name, replay the batch, cross the tenant
   boundary. Tests encode invariants, not behavior — and assert what the
   code DERIVES, never what it merely spells today. A pinned occurrence
   count (`grep -c … → 21`) breaks on the next legitimate site, costing a
   review round to prove "stale pin, not regression"; count both sides and
   assert equality instead (`reviewer-status-contract.test.sh`, #338).
   Presence checks (0/1) are fine — existence IS derived. Prose quoted from
   a budget-capped file is worst, its spelling contested by design, and a
   stale pin must fail loudly ("the literal is gone, this test exercises
   nothing"), never rot into a silent no-op.
7. **Meta-review for rule/config-as-code.** When the diff modifies invariant
   rules or the linter, the rule IS the code — apply items 1–6 to it. A
   bypassable rule manufactures false confidence in every review.
   `/selfreview`'s `<invariantreview>` section has the full checklist.
8. **Unearned defense (subtraction).** For every guard, branch, method,
   DTO, and test added, name the concrete production caller reaching it
   today — a test satisfying only this check doesn't count for the code it
   calls, and needs no caller but its runner. No caller and reachability
   genuinely absent: cut it. Framework/dispatch reachability or a planned
   dependent's need is unresolved, not absent (ship.md lists these) —
   justify in writing instead. Runs before either review marker, so a cut
   can't stale one.

A change is not ready to commit until every item above has an answer.

## Part B — Universal invariant categories

Encode project instances in `.invariants.json` for deterministic enforcement.

- **Injection.** Parameterized queries / bound parameters only — never
  string-built or interpolated SQL, shell, or eval input. Escape at the
  boundary that understands the syntax.
- **Egress allowlisting.** Outbound calls go only to known hosts; a new
  literal host outside the allowlist is a finding. Env-derived targets
  must be host-validated.
- **AuthN/AuthZ fail closed.** Every route, handler, and upgrade path
  verifies identity and authorization server-side. No bypass flags, no
  route outside the auth middleware, no default-allow on error.
- **Secrets/PII never logged.** Logs carry ids, counts, durations, and
  outcomes — never tokens, credentials, email addresses, user content, or
  env secret values. No credentials or private keys committed to the repo.
- **Input containment.** Paths, keys, and URLs from outside are contained:
  reject traversal (plain and encoded), reject SSRF-able targets, bound
  sizes and counts. Applies to BOTH directions of a mirror pair.
- **Output sanitization.** Untrusted content goes through one sanitizing
  pipeline before rendering — no new render path bypasses it, no raw
  `innerHTML`/template injection of unsanitized data.
