# Invariant Rule-Pack Catalog

Reusable rule-packs for `invariant-lint.mjs` (the deterministic half of the
generation doctrine, `~/.claude/rules/generation-doctrine.md`). A repo opts
into packs by listing their ids in `.invariants.json`:

```json
{
  "extends": ["cloudflare-workers", "secrets"],
  "egressAllowlist": ["*.grafana.net"],
  "rules": []
}
```

`/invariants-init` detects the repo's stack and scaffolds this for you.

## `requireTestWithSrc` — require a test alongside changed source

Beyond `extends`/`rules`, `.invariants.json` can require that a change which
touches source also ships a test. It emits a `missing-test` finding and
supports a `severity` (`"hard"` blocks with exit 1, `"warn"` reports — the
**default is `"warn"`**, so existing flat configs are unchanged; an unknown
value degrades to warn with a stderr notice).

Two shapes:

```jsonc
// Legacy flat form — one src→test rule (severity optional, defaults to warn):
"requireTestWithSrc": {
  "enabled": true,
  "srcGlobs": ["src/**"],
  "testGlobs": ["test/**", "**/*.test.*"]
}

// Per-kind form — each requirement is evaluated INDEPENDENTLY, so a UI change
// can be forced to ship an e2e test (a unit test does NOT satisfy it) while a
// plain src change accepts any unit OR e2e test:
"requireTestWithSrc": {
  "enabled": true,
  "severity": "hard",
  "requirements": [
    {
      "srcGlobs": ["web/**"],
      "testGlobs": ["e2e/**", "**/*.spec.*"],
      "message": "web/** (UI) change must ship an e2e test — a unit test does not satisfy a UI change"
    },
    {
      "srcGlobs": ["src/**"],
      "testGlobs": ["test/**", "e2e/**", "**/*.test.*", "**/*.spec.*"],
      "message": "src/** change must ship a test (unit or e2e)"
    }
  ]
}
```

For each requirement, files matching `srcGlobs` but NOT `testGlobs` are the
"untested src"; if any exist and no changed file matches that requirement's
`testGlobs`, one finding is pushed at the configured severity. Empty globs on
either side make a requirement a no-op. `enabled: false` disables the check.

## Catalog

**Security / correctness** (deterministic half of `generation-doctrine.md`):
`secrets`, `typescript`, `react`, `cloudflare-workers`, `rails`, `python`.

**UX** (deterministic half of `ux-doctrine.md`) — the mechanically-checkable
subset of "good UI":

- `a11y` — accessibility invariants for JSX/HTML/Vue/Svelte. Mostly **HARD**:
  alt-less `<img>`, hrefless `<a>`, title-less `<iframe>`, positive
  `tabIndex`, click handlers on non-interactive elements with no keyboard
  path; `autoFocus` is WARN. Patterns match per added line, so a tag split
  across lines can slip — keep the attribute on the opening line.
- `design-system` — design-token discipline, all **WARN** (a one-off literal
  is sometimes legitimate): hardcoded hex colors on style props, raw-`px`
  font sizes, Tailwind arbitrary values, static inline style objects. The
  component-substitution rules (prefer `<Button>` over raw `<button>`) are
  intentionally NOT shipped — component names are repo-specific; add them as
  repo-local `rules`.

The semantic half of UX (states, copy, contrast, focus order) is not
regex-checkable — it lives in `~/.claude/rules/ux-doctrine.md`, which
`/selfreview` walks against UI diffs.

## Pack schema

One pack = one `packs/<id>.json` file. The filename (minus `.json`) IS the
pack id used in `extends`; the `id` field inside is documentation. Keys
starting with `//` are comments and are ignored.

```json
{
  "id": "react",
  "extends": ["typescript"],
  "description": "What this pack enforces and why.",
  "requireEgressAllowlist": false,
  "rules": [
    {
      "id": "unique-rule-id",
      "severity": "hard",
      "include": ["**/*.tsx", "**/*.jsx"],
      "pattern": "a JS regex source string (escape backslashes for JSON)",
      "flags": "i",
      "message": "what was violated and what to do instead"
    }
  ]
}
```

- `extends` (optional): pack ids this pack pulls in transitively.
- `requireEgressAllowlist` (optional): `true` means a repo using this pack
  must declare a non-empty `egressAllowlist`; an empty/missing one is a
  WARN `egress-unconfigured` finding.
- `rules[].severity`: `"hard"` blocks (exit 1), `"warn"` reports.
- `rules[].include`: a glob or array of globs (`**` spans `/`; `*`/`?` do
  not). Always set it — scope rules to the file types they understand.
- `rules[].pattern` + optional `flags` (`imsu` only; `g`/`y` are rejected
  because they make matching stateful): applied per ADDED diff line.

## How `extends` resolves

For each id in the repo's `extends`, the engine looks for `<id>.json` in,
in order (first hit wins):

1. `--packs-dir <dir>` (CLI override)
2. `<repo>/.invariants/packs/` — the VENDORED copies
3. `~/.claude/invariants/packs/` — this catalog (symlinked by `install.sh`)

Resolution recurses through pack `extends`. Guarantees (the engine is
fail-safe — none of these can crash the gate, they warn to stderr and skip):

- **Missing pack id** → warning, skipped; everything else still runs.
- **Malformed pack JSON** → warning, that pack skipped.
- **Circular `extends`** → detected via the recursion stack, cycle broken
  with a warning; diamonds (two packs both extending `typescript`) resolve
  each pack exactly once, silently.
- **Hostile ids** (`"../../etc/passwd"`, separators, leading dots) →
  rejected before any path join.
- **Bad rule in a pack** (missing field, invalid regex/flags) → that one
  rule skipped with a warning; the rest of the pack still applies.

Rules are deduped by rule id: a later/extending pack overrides an earlier
pack's rule of the same id, and a repo's local `rules` entry overrides any
pack rule of the same id (that is the escape hatch when a pack rule is too
broad for one repo — redefine the id locally, e.g. as `"warn"` with a
narrower pattern). The engine's universal built-ins (sql-interpolation,
private-key, hardcoded-credential) always run and cannot be disabled by
packs.

## Vendoring (self-contained CI)

`/invariants-init` copies the SELECTED packs plus their transitive
`extends` into `<repo>/.invariants/packs/`, alongside the vendored
`scripts/invariant-lint.mjs`. CI therefore needs no dotfiles checkout and
no `~/.claude` — the repo carries everything the lint needs, and resolution
order means the vendored copies win even on a machine that also has the
catalog installed.

### Refreshing a repo — `/invariants-init` UPDATE mode (safe to re-run)

`/invariants-init` is **safe to RE-RUN** on a repo that already adopted the
gate. When it finds an existing `.invariants.json`, it switches to UPDATE /
SYNC mode instead of stopping:

- **Re-vendor the mechanism (overwrite freely).** It copies the current
  `~/.claude/scripts/invariant-lint.mjs` over the repo's vendored linter and
  re-copies every pack in the repo's `extends` (full transitive closure) over
  the vendored `.invariants/packs/*.json`. These are copies and are drift-prone
  by design — re-vendoring is exactly how they stay in sync with upstream, so
  overwriting them is expected. It reports which files changed (old→new).
- **Reconcile `.invariants.json` surgically (never clobber policy).** It
  PRESERVES the repo's `extends`, custom `rules` (including pack-rule
  overrides by id), `egressAllowlist`, and all `"//"` comments. It compares
  only the standard params (today: `requireTestWithSrc`) against the current
  recommended shape; if one has drifted it reports a before/after and
  applies — or, for a deliberately tuned value, offers — the recommended
  default, editing ONLY that single key. It never rewrites the whole file.
- **Idempotent.** A second consecutive re-run with no upstream change
  re-vendors byte-identical files and reports no config drift.

This is the supported way to pick up upstream linter/pack changes (do it in a
reviewed PR — vendored packs are pinned on purpose). Manually copying a single
changed pack file over its vendored copy also works for a one-off.

## Adding a new pack

1. Create `packs/<id>.json` here following the schema above.
2. Keep rules low-false-positive: anchor the pattern, exclude the legit
   look-alikes (see `typescript.json`'s `shell-interpolated-exec`, which
   matches `cp.exec(\`${...}\`)` but not `regex.exec(...)`), and test the
   regex against realistic VALID code before shipping it.
3. Prefer `extends` over copying rules between packs.
4. Validate: `python3 -c "import json; json.load(open('packs/<id>.json'))"`
   and run the engine in a scratch repo with `--packs-dir` pointing here.
5. Repos pick it up via `extends`; vendored repos need a re-vendor.
