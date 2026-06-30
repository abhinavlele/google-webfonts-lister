// Regression coverage for the web-security rules ADDED to the typescript pack,
// driven through the REAL lintCustomRules engine. Engine mechanics are covered
// by invariant-lint.test.mjs and the broader pack regexes by
// invariant-packs.test.mjs; this file pins ONLY the new typescript web-sec
// rules so a future edit that breaks one (stops matching a violation, or starts
// matching a safe line) fails CI. Each case attacks or exonerates one rule:
//   expect:true  = a violation that MUST be flagged
//   expect:false = a safe line that must NOT be flagged
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { lintCustomRules } from "./invariant-lint.mjs";

const PACK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "invariants", "packs");
const pack = JSON.parse(readFileSync(path.join(PACK_DIR, "typescript.json"), "utf8"));

// Only the new web-security rule ids — the three originals (no-eval,
// no-function-constructor, shell-interpolated-exec) are covered elsewhere.
const NEW_RULE_IDS = [
  "ts-tls-reject-unauthorized-false",
  "ts-node-tls-reject-unauthorized-env",
  "ts-weak-hash-md5-sha1",
  "ts-insecure-random-secret",
  "ts-node-serialize-deserialize",
  "ts-cors-allow-origin-wildcard",
];

const byId = {};
for (const r of pack.rules) byId[r.id] = r;

// Compile one pack rule into the engine's internal shape. includes is /.*/ so
// the filename gate is a no-op — these cases exercise the pattern, window, and
// suppression logic, not glob routing (which the engine test already covers).
function compiled(ruleId) {
  const r = byId[ruleId];
  assert.ok(r, `rule ${ruleId} must exist in the typescript pack`);
  return {
    id: r.id,
    level: String(r.severity || "warn").toLowerCase() === "hard" ? "HARD" : "WARN",
    includes: [/.*/],
    excludes: [],
    regex: new RegExp(r.pattern, r.flags || ""),
    message: r.message,
  };
}

function flagged(ruleId, file, text) {
  const findings = [];
  const lines = text.split("\n").map((t, i) => ({ line: i + 1, text: t, added: true }));
  lintCustomRules(file, lines, [compiled(ruleId)], findings);
  return findings.length > 0;
}

// [ruleId, file, line, expectFlagged]
const CASES = [
  // -- ts-tls-reject-unauthorized-false --------------------------------------
  ["ts-tls-reject-unauthorized-false", "app.ts", "const agent = new https.Agent({ rejectUnauthorized: false });", true],
  ["ts-tls-reject-unauthorized-false", "app.ts", "  rejectUnauthorized:false,", true],
  ["ts-tls-reject-unauthorized-false", "app.ts", "  rejectUnauthorized: false", true],
  ["ts-tls-reject-unauthorized-false", "app.ts", "  rejectUnauthorized: true,", false],
  ["ts-tls-reject-unauthorized-false", "app.ts", "  rejectUnauthorized: shouldVerify,", false],

  // -- ts-node-tls-reject-unauthorized-env -----------------------------------
  ["ts-node-tls-reject-unauthorized-env", "app.ts", "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';", true],
  ["ts-node-tls-reject-unauthorized-env", "app.ts", "NODE_TLS_REJECT_UNAUTHORIZED=0", true],
  ["ts-node-tls-reject-unauthorized-env", "app.ts", '  "NODE_TLS_REJECT_UNAUTHORIZED": "0",', true],
  ["ts-node-tls-reject-unauthorized-env", "app.ts", "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';", false],

  // -- ts-weak-hash-md5-sha1 -------------------------------------------------
  ["ts-weak-hash-md5-sha1", "app.ts", "const h = createHash('md5').update(x).digest('hex');", true],
  ["ts-weak-hash-md5-sha1", "app.ts", 'const h = createHash("sha1");', true],
  ["ts-weak-hash-md5-sha1", "app.ts", "const h = createHash('MD5');", true],
  ["ts-weak-hash-md5-sha1", "app.ts", 'const h = createHash("sha256");', false],
  ["ts-weak-hash-md5-sha1", "app.ts", 'const h = createHash("sha512");', false],

  // -- ts-insecure-random-secret ---------------------------------------------
  ["ts-insecure-random-secret", "app.ts", "const token = Math.random().toString(36).slice(2);", true],
  ["ts-insecure-random-secret", "app.ts", "const apiKey = Math.random();", true],
  ["ts-insecure-random-secret", "app.ts", "  sessionId: Math.random().toString(),", true],
  ["ts-insecure-random-secret", "app.ts", "const otp = `${Math.random()}`;", true],
  ["ts-insecure-random-secret", "app.ts", "const x = Math.random();", false],
  ["ts-insecure-random-secret", "app.ts", "const jitter = Math.random() * 1000;", false],
  ["ts-insecure-random-secret", "app.ts", "const token = crypto.randomBytes(32).toString('hex');", false],

  // -- ts-node-serialize-deserialize -----------------------------------------
  ["ts-node-serialize-deserialize", "app.ts", "const serialize = require('node-serialize');", true],
  ["ts-node-serialize-deserialize", "app.ts", "const obj = serialize.unserialize(payload);", true],
  ["ts-node-serialize-deserialize", "app.ts", 'import { unserialize } from "node-serialize";', true],
  ["ts-node-serialize-deserialize", "app.ts", "const obj = JSON.parse(payload);", false],
  ["ts-node-serialize-deserialize", "app.ts", "const s = serialize.serialize(obj);", false],

  // -- ts-cors-allow-origin-wildcard -----------------------------------------
  ["ts-cors-allow-origin-wildcard", "app.ts", "res.setHeader('Access-Control-Allow-Origin', '*');", true],
  ["ts-cors-allow-origin-wildcard", "app.ts", '  "Access-Control-Allow-Origin": "*",', true],
  ["ts-cors-allow-origin-wildcard", "app.ts", "res.setHeader('Access-Control-Allow-Origin', req.headers.origin);", false],
  ["ts-cors-allow-origin-wildcard", "app.ts", "res.setHeader('Access-Control-Allow-Methods', '*');", false],
];

for (const [ruleId, file, line, expect] of CASES) {
  assert.ok(NEW_RULE_IDS.includes(ruleId), `case targets a new rule id: ${ruleId}`);
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// Every NEW rule must exist in the pack and compile with its declared flags —
// a broken regex would otherwise only surface at lint time on a real diff.
test("all new typescript web-sec rules compile", () => {
  for (const id of NEW_RULE_IDS) {
    const r = byId[id];
    assert.ok(r, `new rule ${id} must exist in the typescript pack`);
    assert.doesNotThrow(() => new RegExp(r.pattern, r.flags || ""), `rule ${id} regex must compile`);
  }
});
