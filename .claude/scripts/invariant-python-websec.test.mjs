// Regression coverage for the python pack's web-security rules (the ones added
// on top of the original four: subprocess-shell-true, yaml-unsafe-load,
// pickle-load, fstring-sql-execute). Driven through the REAL lintCustomRules
// engine, same as invariant-packs.test.mjs. Each case attacks or exonerates
// exactly one rule:
//   expect:true  = a violation that MUST be flagged
//   expect:false = a safe line that must NOT be flagged
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { lintCustomRules } from "./invariant-lint.mjs";

const PACK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "invariants", "packs");
const pack = JSON.parse(readFileSync(path.join(PACK_DIR, "python.json"), "utf8"));

// Only the NEW web-security rules are under test here; the original four are
// covered elsewhere. Index them by id.
const NEW_RULE_IDS = [
  "py-requests-verify-disabled",
  "py-ssl-unverified-context",
  "py-flask-debug-true",
  "py-weak-hash-md5-sha1",
  "py-insecure-random-secret",
  "py-django-debug-true",
  "py-jinja-render-template-string",
];

const byId = {};
for (const r of pack.rules) byId[r.id] = r;

// Compile one pack rule into the engine's internal shape. includes is /.*/ so
// the filename gate is a no-op — these cases exercise the pattern, window, and
// suppression logic, not glob routing (the engine test covers that).
function compiled(ruleId) {
  const r = byId[ruleId];
  assert.ok(r, `rule ${ruleId} must exist in the python pack`);
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
  // -- py-requests-verify-disabled (hard) ------------------------------------
  ["py-requests-verify-disabled", "app.py", "requests.get(url, verify=False)", true],
  ["py-requests-verify-disabled", "app.py", "httpx.post(url, verify = False)", true],
  ["py-requests-verify-disabled", "app.py", "requests.get(url, verify=True)", false],
  ["py-requests-verify-disabled", "app.py", "requests.get(url, verify=ca_bundle)", false],
  ["py-requests-verify-disabled", "app.py", "noverify=False", false],

  // -- py-ssl-unverified-context (hard) --------------------------------------
  ["py-ssl-unverified-context", "app.py", "ctx = ssl._create_unverified_context()", true],
  ["py-ssl-unverified-context", "app.py", "ssl._create_default_https_context = ssl._create_unverified_https_context", true],
  ["py-ssl-unverified-context", "app.py", "ctx = ssl.create_default_context()", false],

  // -- py-flask-debug-true (hard) --------------------------------------------
  ["py-flask-debug-true", "app.py", "app.run(debug=True)", true],
  ["py-flask-debug-true", "app.py", 'app.run(host="0.0.0.0", port=5000, debug=True)', true],
  ["py-flask-debug-true", "app.py", "app.run(debug=False)", false],
  ["py-flask-debug-true", "app.py", "app.run(host=\"0.0.0.0\")", false],

  // -- py-weak-hash-md5-sha1 (warn) ------------------------------------------
  ["py-weak-hash-md5-sha1", "app.py", "h = hashlib.md5(data)", true],
  ["py-weak-hash-md5-sha1", "app.py", "h = hashlib.sha1(data).hexdigest()", true],
  ["py-weak-hash-md5-sha1", "app.py", "h = hashlib.sha256(data)", false],
  ["py-weak-hash-md5-sha1", "app.py", "h = hashlib.sha512(data)", false],

  // -- py-insecure-random-secret (warn) --------------------------------------
  ["py-insecure-random-secret", "app.py", "token = random.choice(alphabet)", true],
  ["py-insecure-random-secret", "app.py", "session_id = random.getrandbits(128)", true],
  ["py-insecure-random-secret", "app.py", "API_KEY = ''.join(random.sample(chars, 32))", true],
  ["py-insecure-random-secret", "app.py", "x = random.random()", false],
  ["py-insecure-random-secret", "app.py", "jitter = random.randint(0, 5)", false],
  ["py-insecure-random-secret", "app.py", "token = secrets.token_hex(16)", false],

  // -- py-django-debug-true (warn) -------------------------------------------
  ["py-django-debug-true", "settings.py", "DEBUG = True", true],
  ["py-django-debug-true", "settings.py", "DEBUG=True", true],
  ["py-django-debug-true", "settings.py", "DEBUG = False", false],
  ["py-django-debug-true", "settings.py", "MY_DEBUG = True", false],

  // -- py-jinja-render-template-string (warn) --------------------------------
  ["py-jinja-render-template-string", "app.py", "return render_template_string(tpl)", true],
  ["py-jinja-render-template-string", "app.py", "return render_template('index.html', x=x)", false],
];

for (const [ruleId, file, line, expect] of CASES) {
  assert.ok(NEW_RULE_IDS.includes(ruleId), `case targets a new rule id: ${ruleId}`);
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// Every new rule must be present in the pack and compile with its declared
// flags — a broken regex would otherwise only surface at lint time on a diff.
test("all new python web-security rules compile", () => {
  for (const id of NEW_RULE_IDS) {
    const r = byId[id];
    assert.ok(r, `new rule ${id} must exist in the python pack`);
    assert.doesNotThrow(() => new RegExp(r.pattern, r.flags || ""), `rule ${id} regex must compile`);
  }
});
