# Generation Doctrine — Adversarial Self-Review

Standing doctrine for every implementation pass, in every repo. The same
failure classes recur and are only caught by external review: symmetry
blindness, literal-spec over intent, happy-path only, tests that confirm
behavior instead of attacking invariants.

The deterministic complement is `invariant-lint.mjs`, shipped in the
toolkit plugin's `scripts/` (opt-in per repo via `.invariants.json`;
scaffold with `/invariants-init`). A repo composes rule-packs from the
catalog — `.invariants.json` `"extends": ["typescript",
"cloudflare-workers", ...]` — plus parameters and repo-local `rules`.
`/invariants-init` detects the stack, composes `extends`, and vendors the
linter + resolved packs so CI is self-contained. Run `/selfreview` before
committing.

## Part A — Adversarial self-review checklist (complete BEFORE committing)

For every change, write out (PR description, commit message, or working
notes — it must exist somewhere reviewable):

1. **Invariants and enforcement paths (symmetry).** Enumerate the
   invariants this change must uphold, and for each name EVERY code path
   that must enforce it — not just the one you touched. N−1 of N paths
   enforced is zero enforced.
2. **Hostile inputs.** For every new input, parameter, header, file name, or
   query value: state the hostile value (`../../etc/passwd`, a 10 MB string,
   a duplicate id, an id from another tenant) and name the exact line where
   it is rejected. "It can't happen" is not a rejection site.
3. **Inverse / mirror operations.** Identify each operation's inverse —
   import ↔ export, set ↔ clear, add ↔ remove, create ↔ delete, encode ↔
   decode, serialize ↔ parse — and confirm it gets the same validation,
   containment, and auth. If you hardened one direction, justify why the
   other doesn't need it.
4. **Failure, concurrency, replay.** What happens on crash mid-op,
   eviction/restart, concurrent ops, or replay/duplicate delivery? Each
   gets handling or a written justification — not silence.
5. **Literal-spec vs intent.** Flag any literal reading of the spec that
   conflicts with a stated goal. The goal wins; raise the conflict — never
   silently implement the letter against the spirit.
6. **Invariant-violating tests.** For each security/data invariant touched,
   write one test that TRIES TO VIOLATE it — inject through the new
   parameter, smuggle a traversal name, replay the batch, cross the tenant
   boundary. Tests encode invariants, not behavior.
7. **Meta-review for rule/config-as-code.** When the diff modifies invariant
   rules or the linter, the rule IS the code — apply items 1–6. A
   bypassable rule manufactures false confidence in every future review;
   `/selfreview`'s `<invariantreview>` section has the full list.
8. **Unearned defense (subtraction).** For every guard, branch, method,
   DTO, and test added, name the concrete production caller reaching it
   today — a test only satisfying this check doesn't count against the
   code it calls (the test needs no caller but its runner). No caller and
   reachability is genuinely absent — cut it; treat framework/dispatch
   reachability or a planned dependent unit's need as unresolved, not
   absent (ship.md's subtraction step has the full list), and justify in
   writing instead. The one item that prunes; it runs before either review
   marker is stamped, so a cut here can't stale one for nothing.

A change is not ready to commit until every item above has an answer.

## Part B — Universal invariant categories

These apply to every project; encode instances in `.invariants.json`
for deterministic enforcement.

- **Injection.** Parameterized queries / bound parameters only — never
  string-built or interpolated SQL, shell, or eval input. Escape at the
  boundary that understands the syntax.
- **Egress allowlisting.** Outbound network calls go only to known hosts.
  New literal-host calls outside the allowlist are a finding, not a style
  choice. Env-derived targets must be host-validated before use.
- **AuthN/AuthZ fail closed.** Every route, handler, and upgrade path
  verifies identity and authorization server-side. No bypass flags, no
  route added outside the auth middleware, no default-allow on error.
- **Secrets/PII never logged.** Logs carry ids, counts, durations, and
  outcomes — never tokens, credentials, email addresses, user content, or
  env secret values. No credentials or private keys committed to the repo.
- **Input containment.** Paths, keys, and URLs from outside are contained:
  reject traversal (plain and encoded), reject SSRF-able targets, bound
  sizes and counts. Applies to BOTH directions of a mirror pair (import
  and export, upload and download).
- **Output sanitization.** Untrusted content is sanitized through one
  pipeline before rendering — no new render path that bypasses it, no raw
  `innerHTML`/template injection of unsanitized data.
