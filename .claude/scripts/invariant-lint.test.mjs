// Automated self-test for invariant-lint's requireTestWithSrc capability
// (`severity` + per-kind `requirements[]`). Pure node:test + node:assert —
// ZERO new dependencies (the dotfiles repo has no JS test framework).
//
// Importing the linter must NOT run its CLI (it has an import.meta.main /
// argv guard). These are invariant-encoding tests: each case attacks a
// policy boundary, not just the happy path. The headline invariant under
// test: a UNIT test must NOT satisfy a web/UI requirement that demands an
// e2e spec.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lintMissingTest,
  checkTestRequirement,
  resolveMissingTestLevel,
  lintCustomRules,
} from "./invariant-lint.mjs";

// Terse harness: run lintMissingTest against a changed-file list + cfg and
// return the findings array.
function run(changedFiles, cfg) {
  const f = [];
  lintMissingTest(changedFiles, cfg, f);
  return f;
}

const onlyMissingTest = (findings) =>
  findings.filter((x) => x.rule === "missing-test");

// ---------------------------------------------------------------------------
// resolveMissingTestLevel — severity mapping, default, and fail-safe.
// ---------------------------------------------------------------------------
test("resolveMissingTestLevel: hard -> HARD", () => {
  assert.equal(resolveMissingTestLevel("hard"), "HARD");
});

test("resolveMissingTestLevel: warn -> WARN", () => {
  assert.equal(resolveMissingTestLevel("warn"), "WARN");
});

test("resolveMissingTestLevel: undefined -> WARN (default)", () => {
  assert.equal(resolveMissingTestLevel(undefined), "WARN");
  assert.equal(resolveMissingTestLevel(null), "WARN");
});

test("resolveMissingTestLevel: unknown value -> WARN, no throw", () => {
  let level;
  assert.doesNotThrow(() => {
    level = resolveMissingTestLevel("loud");
  });
  assert.equal(level, "WARN");
});

// ---------------------------------------------------------------------------
// requirements[] form — the headline per-kind policy.
// web/** must be covered by an e2e spec (a unit test does NOT satisfy it);
// src/** accepts any unit OR e2e test.
// ---------------------------------------------------------------------------
const REQ_CFG = {
  enabled: true,
  severity: "hard",
  requirements: [
    { srcGlobs: ["web/**"], testGlobs: ["e2e/**/*.spec.*"] },
    {
      srcGlobs: ["src/**"],
      testGlobs: ["test/**", "e2e/**", "**/*.test.*", "**/*.spec.*"],
    },
  ],
};

test("requirements: web change + NO test -> one HARD missing-test", () => {
  const f = run(["web/app.tsx"], REQ_CFG);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "HARD");
  assert.equal(f[0].rule, "missing-test");
});

test("requirements: web change + ONLY a unit test -> STILL one HARD (key invariant)", () => {
  // A unit test does NOT satisfy the e2e requirement for a web/UI change.
  const f = run(["web/app.tsx", "test/x.test.ts"], REQ_CFG);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "HARD");
  assert.equal(f[0].rule, "missing-test");
});

test("requirements: web change + e2e spec -> NO finding", () => {
  const f = run(["web/app.tsx", "e2e/app.spec.ts"], REQ_CFG);
  assert.equal(f.length, 0);
});

test("requirements: web change + e2e NON-spec helper -> STILL HARD", () => {
  // A helper under e2e/ is not a runnable spec; it must not satisfy the rule.
  const f = run(["web/app.tsx", "e2e/helpers.ts"], REQ_CFG);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "HARD");
  assert.equal(f[0].rule, "missing-test");
});

test("requirements: web change + misplaced spec (not under e2e/) -> STILL HARD", () => {
  // web/app.spec.ts matches **/*.spec.* but NOT e2e/**/*.spec.* — the web
  // requirement uses the e2e-scoped glob, so this does not satisfy it.
  const f = run(["web/app.tsx", "web/app.spec.ts"], REQ_CFG);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "HARD");
  assert.equal(f[0].rule, "missing-test");
});

test("requirements: src change + unit test -> NO finding", () => {
  const f = run(["src/lib.ts", "src/lib.test.ts"], REQ_CFG);
  assert.equal(f.length, 0);
});

test("requirements: src change + NO test -> one HARD missing-test", () => {
  const f = run(["src/lib.ts"], REQ_CFG);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "HARD");
  assert.equal(f[0].rule, "missing-test");
});

test("requirements: web+src change + BOTH e2e spec and unit test -> NO findings", () => {
  const f = run(
    ["web/app.tsx", "src/lib.ts", "e2e/app.spec.ts", "src/lib.test.ts"],
    REQ_CFG,
  );
  assert.equal(f.length, 0);
});

test("requirements: web+src change + ONLY a unit test -> exactly ONE finding (the web one)", () => {
  // The src requirement is satisfied by the unit test; only the web->e2e
  // requirement remains unsatisfied. Assert it is the web requirement by its
  // loc pointing at the web source file.
  const f = run(["web/app.tsx", "src/lib.ts", "src/lib.test.ts"], REQ_CFG);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "HARD");
  assert.equal(f[0].rule, "missing-test");
  assert.equal(f[0].loc, "web/app.tsx");
  assert.match(f[0].msg, /web\/\*\*/);
});

// ---------------------------------------------------------------------------
// Legacy flat form — backward compatibility (default WARN) + severity opt-in.
// ---------------------------------------------------------------------------
const FLAT_CFG = {
  enabled: true,
  srcGlobs: ["src/**"],
  testGlobs: ["test/**", "**/*.test.*"],
};

test("legacy flat: src change w/o test -> WARN missing-test (default)", () => {
  const f = run(["src/lib.ts"], FLAT_CFG);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "WARN");
  assert.equal(f[0].rule, "missing-test");
});

test("legacy flat: src change with test -> no finding", () => {
  const f = run(["src/lib.ts", "src/lib.test.ts"], FLAT_CFG);
  assert.equal(f.length, 0);
});

test("legacy flat + severity:hard -> HARD level", () => {
  const f = run(["src/lib.ts"], { ...FLAT_CFG, severity: "hard" });
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "HARD");
  assert.equal(f[0].rule, "missing-test");
});

// ---------------------------------------------------------------------------
// Disabled / absent config — fail-safe no-ops, never throw.
// ---------------------------------------------------------------------------
test("enabled:false -> no findings, no throw", () => {
  let f;
  assert.doesNotThrow(() => {
    f = run(["src/lib.ts"], { ...FLAT_CFG, enabled: false });
  });
  assert.equal(f.length, 0);
});

test("missing cfg (undefined) -> no findings, no throw", () => {
  let f;
  assert.doesNotThrow(() => {
    f = run(["src/lib.ts"], undefined);
  });
  assert.equal(f.length, 0);
});

// ---------------------------------------------------------------------------
// Empty globs — a requirement with nothing to enforce is a no-op.
// ---------------------------------------------------------------------------
test("empty srcGlobs -> no-op (no finding, no throw)", () => {
  let f;
  assert.doesNotThrow(() => {
    f = run(["src/lib.ts"], {
      enabled: true,
      severity: "hard",
      requirements: [{ srcGlobs: [], testGlobs: ["test/**"] }],
    });
  });
  assert.equal(f.length, 0);
});

test("empty testGlobs -> no-op (no finding, no throw)", () => {
  let f;
  assert.doesNotThrow(() => {
    f = run(["src/lib.ts"], {
      enabled: true,
      severity: "hard",
      requirements: [{ srcGlobs: ["src/**"], testGlobs: [] }],
    });
  });
  assert.equal(f.length, 0);
});

// ---------------------------------------------------------------------------
// checkTestRequirement — lock the single-requirement helper directly.
// ---------------------------------------------------------------------------
test("checkTestRequirement: touchesSrc + no test (HARD) -> one finding", () => {
  const f = [];
  checkTestRequirement(
    ["web/a.tsx"],
    { srcGlobs: ["web/**"], testGlobs: ["e2e/**/*.spec.*"] },
    "HARD",
    f,
  );
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "HARD");
  assert.equal(f[0].rule, "missing-test");
});

test("checkTestRequirement: touchesSrc + matching e2e spec -> none", () => {
  const f = [];
  checkTestRequirement(
    ["web/a.tsx", "e2e/a.spec.ts"],
    { srcGlobs: ["web/**"], testGlobs: ["e2e/**/*.spec.*"] },
    "HARD",
    f,
  );
  assert.equal(f.length, 0);
});

// Guard: importing the module above did not run the CLI (no process.exit, no
// linter banner). If it had, the test process would have exited before here.
test("module import did not execute the CLI", () => {
  assert.ok(true);
});

// ---------------------------------------------------------------------------
// lintCustomRules — noqa inline suppression.
// Invariant: a `# noqa: <rule-id>` on the matched line silences that finding;
// `# noqa` (bare) silences all findings on the line; neither suppresses an
// *un-suppressed* violation on a different line.
// ---------------------------------------------------------------------------

// Build a minimal compiled-rule structure matching what compileCustomRules
// produces — enough for lintCustomRules to operate on.
function makeRule(id, pattern, flags = "i") {
  return {
    id,
    level: "HARD",
    includes: [/Dockerfile/],
    excludes: [],
    regex: new RegExp(pattern, flags),
    message: `${id} violated`,
  };
}

function runCustomRules(file, addedLines, rules) {
  // addedLines: array of { line, text, added }
  const findings = [];
  lintCustomRules(file, addedLines, rules, findings);
  return findings;
}

test("lintCustomRules: flags a plain violation", () => {
  const rule = makeRule("docker-from-tag-not-digest-pinned", "^FROM\\s+\\S+");
  const lines = [{ line: 1, text: "FROM alpine:3.20", added: true }];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, "docker-from-tag-not-digest-pinned");
});

test("lintCustomRules: noqa with matching rule-id suppresses finding", () => {
  const rule = makeRule("docker-from-tag-not-digest-pinned", "^FROM\\s+\\S+");
  const lines = [
    { line: 1, text: "FROM builder # noqa: docker-from-tag-not-digest-pinned", added: true },
  ];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 0, "suppressed by matching noqa rule-id");
});

test("lintCustomRules: bare noqa suppresses finding", () => {
  const rule = makeRule("docker-from-tag-not-digest-pinned", "^FROM\\s+\\S+");
  const lines = [{ line: 1, text: "FROM builder # noqa", added: true }];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 0, "suppressed by bare noqa");
});

test("lintCustomRules: noqa with different rule-id does NOT suppress finding", () => {
  const rule = makeRule("docker-from-tag-not-digest-pinned", "^FROM\\s+\\S+");
  const lines = [
    { line: 1, text: "FROM alpine # noqa: some-other-rule", added: true },
  ];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 1, "noqa for different rule-id must not suppress this finding");
});

test("lintCustomRules: code token 'noqa' without # does NOT suppress finding", () => {
  // Invariant: suppression requires a `#` comment marker — bare `noqa` in code
  // (e.g. `echo noqa` or `| sh && echo noqa`) must not bypass the gate.
  const rule = makeRule("docker-curl-pipe-shell", "curl.*\\|.*sh");
  const lines = [
    { line: 1, text: "RUN curl https://example/x.sh | sh && echo noqa", added: true },
  ];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 1, "bare 'noqa' code token must not suppress the finding");
});

test("lintCustomRules: noqa with rule-id containing dots matches literally", () => {
  // rule.id = "corp.rule" — the `.` must not act as a regex wildcard
  const rule = makeRule("corp.rule", "^FROM\\s+\\S+");
  const lines = [
    // "corp_rule" uses `_` instead of `.` — should NOT match the noqa for "corp.rule"
    { line: 1, text: "FROM alpine # noqa: corp_rule", added: true },
  ];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 1, "dot in rule-id must not match underscore in noqa comment");
});

test("lintCustomRules: preceding-line noqa suppresses the next line (Dockerfile alias use-case)", () => {
  // Invariant: a `# noqa: <rule-id>` comment on the line IMMEDIATELY preceding
  // the matched line suppresses the finding. This is the only safe suppression
  // for Dockerfiles because inline `#` after an instruction is parsed as part
  // of the instruction value, not a comment.
  const rule = makeRule("docker-from-tag-not-digest-pinned", "^FROM\\s+\\S+");
  const lines = [
    // Line 1: standalone noqa comment preceding the alias reference
    { line: 1, text: "# noqa: docker-from-tag-not-digest-pinned", added: false },
    // Line 2: multi-stage alias reference that would otherwise be a HARD finding
    { line: 2, text: "FROM builder AS final", added: true },
  ];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 0, "preceding-line noqa must suppress the next-line finding");
});

test("lintCustomRules: preceding-line noqa does not suppress a non-adjacent line", () => {
  const rule = makeRule("docker-from-tag-not-digest-pinned", "^FROM\\s+\\S+");
  const lines = [
    { line: 1, text: "# noqa: docker-from-tag-not-digest-pinned", added: false },
    // Gap: line 3 is not immediately after line 1
    { line: 3, text: "FROM alpine:3.20", added: true },
  ];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 1, "preceding noqa must not bridge a line gap");
  assert.equal(f[0].loc, "Dockerfile:3");
});

test("lintCustomRules: inline noqa suppresses own line; non-adjacent line is still flagged", () => {
  // Line 1: suppressed by its own inline noqa (also acts as preceding-line
  //         suppression for line 2, which is the intended alias-reference use).
  // Line 5: a violation with no suppression — must still be flagged.
  // Lines are not consecutive (gap between 2 and 5) so preceding-line logic
  // must not bridge the gap.
  const rule = makeRule("docker-from-tag-not-digest-pinned", "^FROM\\s+\\S+");
  const lines = [
    { line: 1, text: "FROM builder # noqa: docker-from-tag-not-digest-pinned", added: true },
    { line: 2, text: "FROM builder AS final", added: true }, // suppressed by line 1 preceding-noqa
    { line: 5, text: "FROM alpine:3.20", added: true }, // non-adjacent, not suppressed
  ];
  const f = runCustomRules("Dockerfile", lines, [rule]);
  assert.equal(f.length, 1, "only line 5 should be flagged (line 2 is covered by preceding noqa)");
  assert.equal(f[0].loc, "Dockerfile:5");
});

// ---------------------------------------------------------------------------
// lintCustomRules — //nolint Go-style inline suppression.
// Invariant: `//nolint` and `//nolint:<rule-id>` on the matched line silence
// the finding for Go files (where `# noqa` is not valid syntax).
// ---------------------------------------------------------------------------

function makeGoRule(id, pattern, flags = "") {
  return {
    id,
    level: "WARN",
    includes: [/\.go$/],
    excludes: [],
    regex: new RegExp(pattern, flags),
    message: `${id} violated`,
  };
}

test("lintCustomRules: bare //nolint suppresses Go finding", () => {
  const rule = makeGoRule("go-math-rand-for-tokens", '"math/rand"');
  const lines = [
    { line: 1, text: '\t"math/rand" //nolint:gosec // deterministic jitter only', added: true },
  ];
  const f = runCustomRules("pkg/jitter/jitter.go", lines, [rule]);
  assert.equal(f.length, 0, "suppressed by //nolint");
});

test("lintCustomRules: //nolint with matching rule-id suppresses Go finding", () => {
  const rule = makeGoRule("go-context-todo", "context\\.TODO\\(\\)");
  const lines = [
    { line: 5, text: "\tctx := context.TODO() //nolint:go-context-todo // plumbed at init time", added: true },
  ];
  const f = runCustomRules("internal/server/server.go", lines, [rule]);
  assert.equal(f.length, 0, "suppressed by //nolint:<rule-id>");
});

test("lintCustomRules: //nolint with any linter name suppresses Go finding", () => {
  // Go linter names (gosec, govet, ...) differ from invariant-lint rule ids so
  // any //nolint comment signals deliberate developer intent and suppresses the
  // finding — the rule-id scoping used by `# noqa` does not apply here.
  const rule = makeGoRule("go-context-todo", "context\\.TODO\\(\\)");
  const lines = [
    { line: 3, text: "\tctx := context.TODO() //nolint:govet // intentional root context", added: true },
  ];
  const f = runCustomRules("internal/server/server.go", lines, [rule]);
  assert.equal(f.length, 0, "//nolint with any linter name suppresses the finding");
});

test("lintCustomRules: //nolint suppression on one line does not suppress violation on another", () => {
  const rule = makeGoRule("go-context-todo", "context\\.TODO\\(\\)");
  const lines = [
    { line: 1, text: "\tctx := context.TODO() //nolint:go-context-todo", added: true },
    { line: 2, text: "\tctx2 := context.TODO()", added: true },
  ];
  const f = runCustomRules("cmd/main.go", lines, [rule]);
  assert.equal(f.length, 1, "only line 2 should be flagged");
  assert.equal(f[0].loc, "cmd/main.go:2");
});

test("lintCustomRules: //nolint does NOT suppress finding in non-Go files", () => {
  // Invariant: //nolint suppression is Go-specific; it must not bypass HARD
  // findings in Terraform HCL, YAML, or other files that use `//` comments.
  const rule = {
    id: "tf-deletion-protection-disabled",
    level: "HARD",
    includes: [/\.tf$/],
    excludes: [],
    regex: /deletion_protection\s*=\s*false/,
    message: "deletion_protection = false — set to true in production",
  };
  const lines = [
    { line: 7, text: "  deletion_protection = false //nolint", added: true },
  ];
  const f = runCustomRules("main.tf", lines, [rule]);
  assert.equal(f.length, 1, "//nolint must not suppress HARD finding in a .tf file");
});
