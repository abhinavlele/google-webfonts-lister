---
name: invariants-init
description: Scaffold the current repo to adopt the invariant-lint gate — auto-detect the stack, compose rule-pack `extends`, write .invariants.json, vendor the linter + resolved packs, and add a CI job. Use once per repo when opting in to deterministic invariant enforcement.
---

# Initialize Invariant Gate for This Repo

Scaffold the CURRENT repo to adopt the generation-doctrine invariant gate
(`~/.claude/rules/generation-doctrine.md`). Do all of the following, using
the Write tool directly (no heredocs):

**Extra context/constraints**: $ARGUMENTS

## 1. Detect the stack → compose `extends`

Inspect the repo root (`git rev-parse --show-toplevel`) and map what you
find to rule-pack ids from the catalog (`~/.claude/invariants/packs/`):

| Signal | Pack |
|---|---|
| `package.json` deps/devDeps contain `react` | `react` |
| `package.json` deps/devDeps contain `wrangler` or `@cloudflare/workers-types` (or a `wrangler.toml`/`wrangler.jsonc` exists) | `cloudflare-workers` |
| `package.json` deps/devDeps contain `typescript` (or any `tsconfig.json`) | `typescript` |
| `Gemfile` exists | `rails` |
| `requirements.txt` or `pyproject.toml` exists | `python` |
| always | `secrets` |

Drop redundant ids: `react` and `cloudflare-workers` already extend
`typescript`, so omit `typescript` when either of those is selected. A
polyglot repo gets multiple packs — each rule is scoped by its `include`
globs, so they coexist.

Also note the source/test layout (src/, lib/, app/, test/, tests/, spec/,
e2e/) for `requireTestWithSrc`, and grep for `https?://` literals — these
seed the egress allowlist suggestion.

**Cover gaps — prompt to add missing packs to dotfiles.** List the packs that
actually exist (`ls ~/.claude/invariants/packs/*.json`). If the repo's detected
stack includes a language/framework with NO matching pack (e.g. `go`, `rust`,
`java`, `terraform`, or a framework like `nextjs`/`vue`/`django` lacking its own
pack), that stack's specific invariants are NOT enforced — the repo gets only
the universal built-ins plus whatever related packs exist. For EACH gap:

- State it plainly: "⚠️ No invariant pack for `<X>` in the dotfiles catalog —
  its stack-specific rules won't be enforced yet."
- **Ask the user to add one to their dotfiles** (this is the durable fix — packs
  are shared across all repos): create `claude/invariants/packs/<X>.json` (schema
  + how-to in `~/.claude/invariants/README.md`), commit it via a dotfiles PR, then
  re-run `/invariants-init` here to vendor it.
- Offer to scaffold a starter: write a minimal `<X>.json` stub (id, description,
  a sensible default `include` glob, and a `rules` array with at least one
  obviously-true starter rule so the id resolves, plus a `"//"` TODO) into
  `<repo>/.invariants/packs/<X>.json`, and PRINT its contents so the user can lift
  it straight into the dotfiles catalog. Only add `<X>` to `extends` once it
  resolves to a real pack (vendored stub or upstream).

Do NOT block adoption on this — proceed with the available packs and surface every
gap in the final report (step 5).

## 2. Write a starter `.invariants.json` at the repo root

Base it on `~/.claude/.invariants.example.json` (the `"//"` keys are
comments — keep them as inline documentation). Tailor it:

- `extends`: the pack ids detected above.
- `egressAllowlist`: if `cloudflare-workers` (or any
  `requireEgressAllowlist` pack) was selected, this is REQUIRED — without
  it the lint emits a WARN `egress-unconfigured` on every run. Seed it with
  the legitimate outbound host globs you found (e.g. `["*.example.com"]`);
  if you found none, write an empty array plus a `"//"` comment telling the
  owner to fill it in. For other stacks, omit the key if the repo should
  not enforce egress.
- `requireTestWithSrc`: set `srcGlobs`/`testGlobs` to the detected layout.
- `rules`: an EMPTY array (with the `"//"` doc comment) — repo-specific
  invariants get added as they are discovered; packs carry the stack-level
  ones. Note in the comment that reusing a pack rule's id here overrides it.

If `.invariants.json` already exists, do NOT overwrite it — report and stop.

## 3. Vendor the linter AND the resolved packs

Self-contained CI is the point: the repo must lint with no dotfiles and no
`~/.claude` present.

1. Copy `~/.claude/scripts/invariant-lint.mjs` to
   `<repo>/scripts/invariant-lint.mjs` (create `scripts/` if needed,
   preserve the executable bit). The `// VENDORED` header marks the
   canonical source.
2. Resolve the FULL pack closure: the selected `extends` ids plus,
   recursively, every id those packs `extends` (e.g. selecting
   `cloudflare-workers` also vendors `typescript`). Copy each
   `~/.claude/invariants/packs/<id>.json` to
   `<repo>/.invariants/packs/<id>.json`. The engine prefers this vendored
   dir over `~/.claude/invariants/packs`, so CI and local runs see the
   same rules.

Sanity-check both: `node scripts/invariant-lint.mjs --help`, then a real
run — confirm the header line lists the expected packs (e.g.
`packs: typescript, cloudflare-workers`) and that no `pack ... not found`
warnings appear on stderr.

## 4. Add a CI job

Detect the default branch (`gh repo view --json defaultBranchRef --jq
.defaultBranchRef.name`; never hardcode `main`). Add a GitHub Actions job —
either a new `.github/workflows/invariant-lint.yml` or a job appended to the
existing CI workflow — shaped like:

```yaml
invariant-lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - uses: actions/setup-node@v4
      with:
        node-version: 22
    - run: node scripts/invariant-lint.mjs --base origin/<default>
```

(`fetch-depth: 0` is required — the linter diffs against the base ref. No
extra checkout is needed for packs: they are vendored in the repo.)

## 5. Print the detected stack + next steps

Report to the user:

- The detected stack and the composed `extends` (e.g. "found wrangler +
  typescript → `extends: ["secrets", "cloudflare-workers"]`, vendored
  packs: secrets, cloudflare-workers, typescript").
- Files created (`.invariants.json`, `scripts/invariant-lint.mjs`,
  `.invariants/packs/*.json`, workflow).
- **Any UNCOVERED stacks** (detected language/framework with no catalog pack),
  with the explicit ask to add a pack to dotfiles
  (`claude/invariants/packs/<id>.json`, schema in
  `~/.claude/invariants/README.md`) and re-run — list each gap by name. If you
  scaffolded local stub packs, say so and that they should be upstreamed.
- NEXT STEP if an egress-checked pack was selected: fill in
  `egressAllowlist` with the repo's real outbound hosts — until then every
  run carries the `egress-unconfigured` WARN.
- That the PreToolUse gate (`invariant_gate.py`) now activates automatically
  for this repo on `git push` / `gh pr create` (opt-in is the presence of
  `.invariants.json`); bypass per-command with `SKIP_INVARIANT_GATE=1`.
- Suggest running `node scripts/invariant-lint.mjs` now to baseline, and
  `/selfreview` before each commit.
- Remind: tune `.invariants.json` as the repo's invariants grow — every
  standing invariant expressible as a regex over added lines belongs in
  `rules` (or, if stack-generic, as a new catalog pack —
  `~/.claude/invariants/README.md`).
