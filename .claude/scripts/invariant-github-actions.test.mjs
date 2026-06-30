// Regression coverage for the github-actions rule-pack patterns, driven through
// the REAL lintCustomRules engine. Engine mechanics (window, suppression) are
// covered by invariant-lint.test.mjs; this file pins the pack REGEXES and the
// include-glob routing so a future edit that breaks a security rule (stops
// matching a violation, or starts matching a safe line) fails CI.
//   expect:true  = a violation that MUST be flagged
//   expect:false = a safe line that must NOT be flagged
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { lintCustomRules } from "./invariant-lint.mjs";

const PACK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "invariants",
  "packs",
  "github-actions.json",
);

const pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
const byId = {};
for (const r of pack.rules) byId[r.id] = r;

// Minimal glob -> RegExp mirroring the engine's globToRegExp semantics
// (`**` spans `/`, `*`/`?` do not) so the routing cases below exercise the
// pack's REAL include globs, not a stand-in.
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:[^/]*/)*";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

// Compile a pack rule into the engine's internal shape. `realIncludes` routes
// the include-glob test: when false, includes is /.*/ so the filename gate is a
// no-op and the case exercises only the pattern; when true, the rule's actual
// include globs are compiled so the case confirms glob routing.
function compiled(ruleId, realIncludes = false) {
  const r = byId[ruleId];
  assert.ok(r, `rule ${ruleId} must exist in the pack`);
  const includeGlobs = Array.isArray(r.include) ? r.include : [r.include];
  return {
    id: r.id,
    level: String(r.severity || "warn").toLowerCase() === "hard" ? "HARD" : "WARN",
    includes: realIncludes ? includeGlobs.map(globToRegExp) : [/.*/],
    excludes: [],
    regex: new RegExp(r.pattern, r.flags || ""),
    message: r.message,
  };
}

function flagged(ruleId, file, text, realIncludes = false) {
  const findings = [];
  const lines = text.split("\n").map((t, i) => ({ line: i + 1, text: t, added: true }));
  lintCustomRules(file, lines, [compiled(ruleId, realIncludes)], findings);
  return findings.length > 0;
}

// 40-hex commit SHA used to assert the unpinned-action rule exempts SHA pins.
const SHA40 = "1234567890abcdef1234567890abcdef12345678";

// [ruleId, file, line, expectFlagged]
const CASES = [
  // -- gha-script-injection --------------------------------------------------
  ["gha-script-injection", "ci.yml", '          run: echo "${{ github.event.issue.title }}"', true],
  ["gha-script-injection", "ci.yml", '          run: echo "${{ github.event.pull_request.body }}"', true],
  ["gha-script-injection", "ci.yml", "          run: echo ${{ github.event.comment.body }}", true],
  ["gha-script-injection", "ci.yml", "          run: echo ${{ github.head_ref }}", true],
  ["gha-script-injection", "ci.yml", "          run: echo ${{ github.event.pull_request.head.ref }}", true],
  ["gha-script-injection", "ci.yml", "          run: echo ${{ github.sha }}", false],
  ["gha-script-injection", "ci.yml", "          run: echo ${{ github.event.issue.number }}", false],
  ["gha-script-injection", "ci.yml", "          run: echo ${{ github.repository }}", false],

  // -- gha-pull-request-target -----------------------------------------------
  ["gha-pull-request-target", "ci.yml", "  pull_request_target:", true],
  ["gha-pull-request-target", "ci.yml", "on:\n  pull_request_target:\n    types: [opened]", true],
  ["gha-pull-request-target", "ci.yml", "  pull_request:", false],
  ["gha-pull-request-target", "ci.yml", "  push:", false],

  // -- gha-unpinned-action ---------------------------------------------------
  ["gha-unpinned-action", "ci.yml", "        uses: some-org/some-action@v1", true],
  ["gha-unpinned-action", "ci.yml", "        uses: some-org/some-action@main", true],
  ["gha-unpinned-action", "ci.yml", `        uses: some-org/some-action@${SHA40}`, false],
  ["gha-unpinned-action", "ci.yml", `        uses: actions/checkout@${SHA40}`, false],
  ["gha-unpinned-action", "ci.yml", "        uses: actions/checkout@v4", false],
  ["gha-unpinned-action", "ci.yml", "        uses: github/codeql-action/init@v2", false],
  ["gha-unpinned-action", "ci.yml", "        uses: ./.github/actions/build", false],

  // -- gha-permissions-write-all ---------------------------------------------
  ["gha-permissions-write-all", "ci.yml", "permissions: write-all", true],
  ["gha-permissions-write-all", "ci.yml", "  permissions: write-all", true],
  ["gha-permissions-write-all", "ci.yml", "  contents: read", false],
  ["gha-permissions-write-all", "ci.yml", "permissions:", false],
];

for (const [ruleId, file, line, expect] of CASES) {
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// Include-glob routing: with the rule's REAL include globs, a workflow path
// under .github/workflows is linted, while a file outside that path is routed
// out entirely (no finding even though the line would otherwise match).
test("include globs route a real workflow path in", () => {
  assert.equal(
    flagged("gha-permissions-write-all", ".github/workflows/ci.yml", "permissions: write-all", true),
    true,
  );
});

test("include globs route a non-workflow path out", () => {
  assert.equal(
    flagged("gha-permissions-write-all", "README.md", "permissions: write-all", true),
    false,
  );
});

// Every pattern in the pack must compile with its declared flags — a broken
// regex would otherwise only surface at lint time on a real diff.
test("all github-actions pack rules compile", () => {
  for (const r of pack.rules) {
    assert.doesNotThrow(
      () => new RegExp(r.pattern, r.flags || ""),
      `rule ${r.id} regex must compile`,
    );
  }
});
