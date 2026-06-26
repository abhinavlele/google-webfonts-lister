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
| renders a UI — deps contain `react`/`vue`/`svelte`/`@angular`/`solid-js`, OR the repo has `**/*.tsx`/`**/*.jsx`/`**/*.vue`/`**/*.svelte` files, OR server-rendered `.erb`/`.html.*` templates | `a11y` |
| has a design system — Tailwind (`tailwind.config.*`), a tokens/theme dep (`@radix-ui/*`, `styled-components`, `@emotion/*`, `@chakra-ui/*`, a `tokens`/`design-system` package or dir), OR any UI pack was selected above | `design-system` |
| `go.mod` exists | `go` |
| always | `secrets` |

Drop redundant ids: `react` and `cloudflare-workers` already extend
`typescript`, so omit `typescript` when either of those is selected. A
polyglot repo gets multiple packs — each rule is scoped by its `include`
globs, so they coexist.

**UX packs (`a11y`, `design-system`) — what they are and how strict.** These
are the deterministic, regex-checkable subset of "good UI"; the semantic half
(states, copy, contrast, focus order) lives in the always-loaded
`~/.claude/rules/ux-doctrine.md` that `/selfreview` walks — mention it when you
offer these packs. `a11y` rules are mostly **HARD** (a hrefless anchor, an
alt-less image, a positive tabindex are never intentional). `design-system`
rules are all **WARN** (a one-off literal is sometimes legitimate) — tell the
owner they can promote any rule to HARD or narrow its `include` by redefining
the rule id in `.invariants.json` once the team agrees. Offer `a11y` whenever a
UI is detected; offer `design-system` alongside it but flag that its
component-substitution rules (prefer `<Button>` over raw `<button>`) are
repo-specific and belong in the repo's local `rules` (the pack ships only the
generic literal/token checks).

Also note the source/test layout (src/, lib/, app/, test/, tests/, spec/,
e2e/) for `requireTestWithSrc`, and grep for `https?://` literals — these
seed the egress allowlist suggestion.

**Cover gaps — prompt to add missing packs to dotfiles.** List the packs that
actually exist (`ls ~/.claude/invariants/packs/*.json`). If the repo's detected
stack includes a language/framework with NO matching pack (e.g. `rust`,
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
- `requireTestWithSrc`: pick the shape from the detected layout:
  - **If the repo has an `e2e/` directory** (Playwright/Cypress/etc.), the
    RECOMMENDED shape is the HARD per-kind form — a UI change must ship a
    runnable e2e spec (a unit test does NOT satisfy it), while a plain
    `src/**` change accepts any unit OR e2e test:
    ```json
    "requireTestWithSrc": {
      "enabled": true, "severity": "hard",
      "requirements": [
        { "srcGlobs": ["web/**"], "testGlobs": ["e2e/**/*.spec.*"], "message": "web/** (UI) change must ship a runnable e2e spec (e2e/**/*.spec.*) — a unit test does not satisfy a UI change" },
        { "srcGlobs": ["src/**"], "testGlobs": ["test/**","e2e/**","**/*.test.*","**/*.spec.*"], "message": "src/** change must ship a test (unit or e2e)" }
      ]
    }
    ```
    Note that `web/**` matches assets too (CSS, images) — if forcing an e2e
    spec on a pure-CSS change is too strict for the team, narrow the first
    `srcGlobs` (e.g. `["web/**/*.ts","web/**/*.tsx"]`). Map `web/**` and
    `src/**` to whatever the repo's actual UI vs. server dirs are.
  - **If there is NO `e2e/` directory**, keep the generic flat WARN shape with
    `srcGlobs`/`testGlobs` set to the detected layout:
    ```json
    "requireTestWithSrc": { "enabled": true, "srcGlobs": ["src/**"], "testGlobs": ["test/**", "**/*.test.*"] }
    ```
- `rules`: an EMPTY array (with the `"//"` doc comment) — repo-specific
  invariants get added as they are discovered; packs carry the stack-level
  ones. Note in the comment that reusing a pack rule's id here overrides it.

## 2a. If `.invariants.json` ALREADY exists → UPDATE / SYNC mode (re-run)

Do NOT just stop. A re-run of `/invariants-init` against a repo that already
adopted the gate is the supported way to REFRESH it — pick up a newer dotfiles
linter, newer rule-packs, and the current recommended config defaults —
WITHOUT clobbering the repo's hand-authored policy. Follow these steps in
order; the goal is "re-vendor the mechanism freely, reconcile the policy
surgically."

### Step U1 — Re-vendor the mechanism (safe to overwrite)

The vendored linter and packs are COPIES of the dotfiles originals; they are
drift-prone by nature (a stale vendored copy silently runs old rules), so
overwriting them on every re-run is expected and correct.

1. Copy `~/.claude/scripts/invariant-lint.mjs` →
   `<repo>/scripts/invariant-lint.mjs`, preserving the executable bit and the
   `// VENDORED` header. Before overwriting, capture the old file's content (or
   its `git hash-object`) so you can REPORT whether it changed.
2. For EVERY pack in the repo's existing `extends` (resolve the full closure,
   including transitive `extends` — same as step 3 below), copy
   `~/.claude/invariants/packs/<id>.json` → `<repo>/.invariants/packs/<id>.json`,
   overwriting the vendored copy. Capture which pack files changed.
3. Do NOT add or remove packs from `extends` here — re-vendoring refreshes the
   CONTENT of already-selected packs. (If the stack genuinely grew, the owner
   re-runs detection in step 1 and edits `extends` deliberately.)

### Step U2 — Reconcile `.invariants.json` SAFELY (never clobber repo policy)

Read the existing `.invariants.json`. PRESERVE verbatim: `extends`, the repo's
custom `rules` (including any rule that overrides a pack rule by id), the
`egressAllowlist`, all `"//"` documentation comments, and any repo-specific
params. You are NOT rewriting the file — you are reconciling ONLY the standard
params that have a current recommended shape.

1. Compare the repo's `requireTestWithSrc` against the CURRENT RECOMMENDED
   shape for this repo (per section 2 above: HARD per-kind when an `e2e/` dir
   exists, generic flat WARN otherwise). If it has DRIFTED (e.g. it is still
   the old flat WARN form but the repo now has an `e2e/` dir, or it is missing
   a `severity`), REPORT the drift with a clear before/after of just that
   param, and APPLY the recommended default — modifying ONLY
   `requireTestWithSrc`, leaving `extends` / `rules` / `egressAllowlist` /
   comments byte-for-byte intact. If the repo's existing value already encodes
   a deliberate, stricter-or-equal policy (e.g. custom `srcGlobs`/`message`
   the owner clearly tuned), do NOT overwrite it — OFFER the recommended shape
   in the report and let the owner decide.
2. Apply the same compare-report-reconcile to any other standard param that
   later grows a recommended shape, always touching ONLY that one key.
3. The reconcile is ADDITIVE and EXPLICIT: every change is a single-param edit
   shown as before/after. If nothing drifted, say so and leave the file
   untouched.

### Step U3 — Report a drift summary

End UPDATE mode with:
- **Linter:** changed (old hash → new hash) or already current.
- **Packs:** which vendored pack files were updated (and that vendored copies
  are otherwise drift-prone — this re-vendor is how they stay in sync).
- **Config:** each `.invariants.json` param recommendation applied (with
  before/after) or merely offered; confirm `extends`, custom `rules`, and
  `egressAllowlist` were preserved unchanged.
- The sanity checks: `node scripts/invariant-lint.mjs --help`, then a real run
  (`node scripts/invariant-lint.mjs`) — confirm the header lists the expected
  packs and no `pack ... not found` warnings appear.

UPDATE mode is idempotent: a second consecutive re-run with no upstream change
re-vendors byte-identical files and reports no config drift. STOP after the
update flow — do not run the NEW-repo scaffold steps 3–4 again (the CI job and
pack closure are already in place; the re-vendor above already refreshed them).

The rest of this document (steps 3–5) is the NEW-repo scaffold path, taken only
when `.invariants.json` did NOT already exist.

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
- If a UX pack (`a11y`/`design-system`) was selected: note that these cover
  only the mechanical subset of UI quality, and point the owner at
  `~/.claude/rules/ux-doctrine.md` (the states / keyboard / real-data / copy
  checklist `/selfreview` walks) for the semantic half. Remind that
  `design-system` rules are WARN by default — promote to HARD per the team's
  bar by redefining the rule id locally.
- Suggest running `node scripts/invariant-lint.mjs` now to baseline, and
  `/selfreview` before each commit.
- Remind: tune `.invariants.json` as the repo's invariants grow — every
  standing invariant expressible as a regex over added lines belongs in
  `rules` (or, if stack-generic, as a new catalog pack —
  `~/.claude/invariants/README.md`).
