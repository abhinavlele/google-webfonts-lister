---
name: invariants-from-doc
description: Read a design doc (implementation-plan.md, RFC, ADR, etc.) and propose new .invariants.json rules for every numeric or behavioral assertion it makes. Use once per repo when the design doc lands, and again whenever a numeric assertion in the doc changes. Turns "the design says up to 100 devices" from a comment into a gate-enforced check.
---

# Extract Invariants from a Design Doc

Turn assertions in a project's design document into mechanically-enforced
invariant-lint rules. The design doc's numeric caps, TTL values, retry
counts, size limits, and behavioral guarantees are exactly the kind of
thing that drifts silently between doc and code without ever failing a
test. This skill closes that loop.

**Target doc**: $ARGUMENTS (default: `docs/implementation-plan.md`;
also try `docs/design.md`, `docs/rfc/*.md`, `README.md`, or the first
Markdown file under `docs/` that reads like a design)

## Prerequisites

- Repo must have `.invariants.json` at the root. If not, run
  `/invariants-init` first — this skill *extends* an existing config,
  it doesn't scaffold one.
- The design doc should be committed to the repo (extracted rules
  reference specific doc anchors in their `//` field for traceability).

## 1. Locate + read the design doc

`$ARGUMENTS` is the doc path passed by the user (e.g.
`/invariants-from-doc docs/rfc/foo.md`). If `$ARGUMENTS` is empty,
fall back in order: `docs/implementation-plan.md`, `docs/design.md`,
`docs/rfc/*.md` (first match), `README.md`. Error out if none of these
exist and no path was supplied.

Read the whole doc. Note its length in lines — you'll reference line
numbers in each proposed rule's `//` field.

## 2. Extract candidate assertions

Walk the doc looking for these five shapes. Copy the exact line
plus the surrounding sentence into a working list.

### Shape A — Numeric caps

Language: "up to N", "at most N", "no more than N", "N maximum",
"capped at N", "limit of N".

Examples from real docs:
- "Bulk provision requests carry **up to 100 devices**."
- "Idempotency claims are cached for **24 hours**."
- "The account seed is rotated with **at most 3 concurrent signing keys**."

For each, note the field/operation being bounded, the numeric value,
and the units (count, seconds, bytes, etc.).

### Shape B — Numeric floors

Language: "at least N", "minimum of N", "no fewer than N", "requires N".

### Shape C — Enum / allow-lists

Language: "one of X, Y, Z", "must be X or Y", "the following values",
"valid values are".

Examples:
- "`bootstrap_state` is one of `resolver_pending`, `ready`, `revoked`."
- "`LOG_LEVEL` must be `debug`, `info`, `warn`, or `error`."

### Shape D — Never / always assertions

Language: "the server MUST NOT", "never logs", "always encrypted",
"never stored", "at rest is always X".

Examples:
- "The server **never stores per-device seeds** — the bike generates
  its NKey locally."
- "IMEIs **are never emitted at INFO level** in access logs."

### Shape E — Cross-field relationships

Language: "X must be less than Y", "X + Y must not exceed Z".

Examples:
- "The middleware timeout must be strictly less than `WriteTimeout`."
- "Bulk `Size × Concurrency` must not exceed the DynamoDB per-second
  write-capacity units for the identity table."

## 3. Map each assertion to a rule shape

| Assertion shape | Rule shape | Severity default |
|---|---|---|
| Numeric cap on config field | `getEnvInt` name-match + WARN pointing at bounded helper | warn |
| Numeric cap on request field | pack rule matching handler's validation line | hard |
| Numeric floor on config field | Same as cap, symmetric | warn |
| Enum / allow-list on config | `default:` fail-closed check + explicit list in code | warn |
| Enum / allow-list on request field | Handler validation regex | hard |
| Never / always on code path | Path-scoped regex matching the forbidden shape | hard |
| Cross-field | Not directly regex-able; propose a doctrine note or a code-level assertion | note |

Rules that CANNOT be expressed as a line-level regex go into a
separate "doctrine additions" list — they belong in a **repo-local**
`.invariants/doctrine.md` file (created if absent), NOT the global
security-reviewer agent (which is shared across all repos and must stay
project-agnostic). When spawning the security-reviewer, pass the path
to this file so the reviewer loads the repo's project-specific doctrine.

## 4. Generate proposals

For each assertion produce a proposed rule block. Include:

- `id`: `<repo-short>-<subject>-<constraint>` (e.g.
  `device-identity-bulk-max-size-cap`)
- `severity`: per the mapping table above
- `include`: narrow globs; NEVER `**/*` for a project-specific rule
- `pattern`: the regex. Test it against real code before proposing
- `message`: 1-2 sentences that name the doc's constraint AND cite the
  doc line ("Design assertion at docs/implementation-plan.md:678")
- `//`: the exact doc sentence, verbatim, so a future editor of the
  doc can search for anywhere the invariant is enforced

For non-regex-able assertions (Shape E, most Shape D), produce a
one-line doctrine addition instead:
- Which security-reviewer dimension it fits under
- The doc-line reference
- The reviewable question ("For this diff: does X still hold?")

Doctrine additions are stored in `.invariants/doctrine.md` (repo-local),
never in the global security-reviewer agent file.

## 5. Present for user review

**Hard fence — this skill is present-for-review, NOT auto-apply.** Even
under AUTO-ACCEPT MODE (see the global sub-agent preamble), this step
does not qualify: the deliverable is a *proposal* the human has to
accept. Do NOT invoke Write or Edit against `.invariants.json`, the
security-reviewer agent file, or any pack under `.invariants/packs/`.
Do NOT run `git add` or `git commit`. Print the proposals to the
conversation and stop. The user's explicit "apply proposals N, M, ..."
(or equivalent affirmative reply) is the only signal that unlocks
step 6 below. This override applies to every agent that runs this
skill.

Print each proposal in a diff-style block:

```
Proposed .invariants.json rules:

  Rule: device-identity-bulk-max-size-cap
    Doc: implementation-plan.md:678 "Bulk provision ... up to 100 devices"
    Would add:
      {
        "id": "device-identity-bulk-max-size-cap",
        "severity": "warn",
        "include": ["internal/config/**/*.go"],
        "pattern": "getEnvInt\\s*\\(\\s*\"BULK_MAX_SIZE\"",
        "message": "...",
        "//": "..."
      }
    Verified against current code:
      - flags: internal/config/config.go:56 (matches — the field IS unbounded)
      - ignores: no false positives found

  Rule: device-identity-no-per-device-seed  [ALREADY PRESENT]
    Doc: implementation-plan.md:412 "server never stores per-device seeds"
    Skipping: this invariant is already enforced by an existing rule.

Proposed doctrine additions (security-reviewer):

  - Under `defense-in-depth-limits`: BULK_MAX_SIZE × BULK_CONCURRENCY
    must not exceed the DynamoDB WCU cap for the identity table
    (implementation-plan.md:730). Not regex-able; flag when either
    field is modified.
```

Wait for user confirmation. Only after the user names which proposals
to apply (e.g. "apply 1 and 3, skip 2") does this skill edit
`.invariants.json`, `.invariants/doctrine.md` (for doctrine additions),
and any regression tests in `scripts/invariant-packs.test.mjs` (or the
repo's local test file) — and only those files, only those rules. Never
edit the global security-reviewer agent with project-specific assertions.
Commit as
`chore(invariants): scaffold rules from <doc-path>` with a short prose
body (per `rules/pr-comments.md` length caps: ≤ 3 sentences, no
bullets) that names the doc and the *why* — the list of rules is in
the diff itself. Ambiguous replies ("looks good", "sure") are NOT
confirmation — ask which specific proposals to apply and wait again.

## 6. Verify each new rule doesn't false-positive

For every accepted regex rule, run:

```bash
node scripts/invariant-lint.mjs
```

against a diff that touches the relevant code path. Confirm each rule
flags the code cited in its message and doesn't flag surrounding
legitimate code. Add regression tests to
`scripts/invariant-packs.test.mjs` (or the repo's local test file for
invariant regexes) so future refactors that break the rule surface at
CI, not at review time.

## Non-goals

- Do NOT try to extract every English sentence in the doc. Focus on
  numeric caps, enums, "never/always" claims, and cross-field
  relationships. Prose about "why" or "how" doesn't map to invariants.
- Do NOT propose rules that require multi-line context to check
  reliably. Those go into the doctrine list, not the pack.
- Do NOT modify the design doc. If the doc's assertion is ambiguous,
  surface the ambiguity and let the doc author clarify.

## When to re-run

- Whenever a numeric assertion in the design doc changes.
- Whenever a new design doc lands under `docs/`.
- After a security review flags a class of finding that maps to a doc
  assertion the pack doesn't yet enforce.
