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
