# Generation Doctrine — Adversarial Self-Review

Standing doctrine for every implementation pass, in every repo. The same
failure classes recur and are only caught by external review: symmetry
blindness (a guard added to one code path but not its mirror), literal-spec
over intent, happy-path only, and tests that confirm behavior instead of
attacking invariants.

The deterministic complement is `invariant-lint.mjs`, shipped in the
abhinav-lele-claude-code-toolkit plugin's `scripts/`
(opt-in per repo via `.invariants.json`; scaffold with `/invariants-init`).
A repo declares its invariants by composing rule-packs from the catalog —
`.invariants.json` `"extends": ["typescript", "cloudflare-workers", ...]`
(see the plugin's `invariants/README.md`) — plus parameters (`egressAllowlist`,
`requireTestWithSrc`) and repo-local `rules`. `/invariants-init` detects the
stack, composes `extends`, and vendors the linter + resolved packs so CI is
self-contained. Run `/selfreview` before committing.

## Part A — Adversarial self-review checklist (complete BEFORE committing)

For every change, write out (PR description, commit message, or working
notes — it must exist somewhere reviewable):

1. **Invariants and enforcement paths (symmetry).** Enumerate the invariants
   this change must uphold. For each, name EVERY code path that must enforce
   it — not just the one you touched. An invariant enforced on N−1 of N
   paths is enforced on zero.
2. **Hostile inputs.** For every new input, parameter, header, file name, or
   query value: state the hostile value (`../../etc/passwd`, `%2e%2e%2f`, a
   10 MB string, a negative number, a duplicate id, an id from another
   tenant, `<img onerror>`, `'; DROP TABLE`) and name the exact line where
   it is rejected. "It can't happen" is not a rejection site.
3. **Inverse / mirror operations.** Identify each operation's inverse or
   mirror — import ↔ export, set ↔ clear, add ↔ remove, create ↔ delete,
   encode ↔ decode, serialize ↔ parse — and confirm the mirror receives
   matching treatment (same validation, same containment, same auth). If you
   hardened one direction, justify in writing why the other does not need it.
4. **Failure, concurrency, replay.** What happens on crash mid-operation? On
   eviction/restart? On two concurrent operations? On replay or duplicate
   delivery of the same request/batch? Each scenario gets handling or a
   written justification of impossibility — not silence.
5. **Literal-spec vs intent.** Flag any place where a literal reading of the
   spec or requirement conflicts with a stated goal. The goal wins; raise
   the conflict explicitly — never silently implement the letter against
   the spirit.
6. **Invariant-violating tests.** For each security or data invariant the
   change touches, write at least one test that TRIES TO VIOLATE it —
   inject through the new parameter, smuggle a traversal name, replay the
   batch, cross the tenant boundary. Tests encode invariants, not behavior:
   a happy-path test is documentation, not defense.
7. **Meta-review for rule/config-as-code.** When the diff modifies invariant
   rules or the linter, the rule IS the code — apply items 1–6 to it. A
   bypassable rule manufactures false confidence in every future review.
   `/selfreview`'s `<invariantreview>` section has the full checklist.

A change is not ready to commit until every item above has an answer.

## Part B — Universal invariant categories

These apply to every project; encode project-specific instances in that
repo's `.invariants.json` so `invariant-lint` enforces them deterministically.

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
  reject traversal (plain and encoded), reject SSRF-able user-supplied
  targets, bound sizes and counts. Containment applies to BOTH directions
  of a mirror pair (import and export, upload and download).
- **Output sanitization.** Untrusted content is sanitized through one
  pipeline before rendering — no new render path that bypasses it, no raw
  `innerHTML`/template injection of unsanitized data.
