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
catalog installed. To pick up upstream pack changes, re-run
`/invariants-init` logic for the copy step (or copy the changed pack file
over the vendored one) in a reviewed PR — vendored packs are pinned on
purpose.

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
