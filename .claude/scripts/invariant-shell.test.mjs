// Regression coverage for the shell rule-pack patterns, driven through the
// REAL lintCustomRules engine. Engine mechanics live in invariant-lint.test.mjs;
// this file pins the shell pack REGEXES so a future edit that breaks a security
// rule (stops matching a violation, or starts matching a safe line) fails CI.
//   expect:true  = a violation that MUST be flagged
//   expect:false = a safe line that must NOT be flagged
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { lintCustomRules } from "./invariant-lint.mjs";

const PACK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "invariants", "packs");

// Index every rule in the shell pack by id.
const byId = {};
{
  const pack = JSON.parse(readFileSync(path.join(PACK_DIR, "shell.json"), "utf8"));
  for (const r of pack.rules) byId[r.id] = r;
}

// Compile one pack rule into the engine's internal shape. includes is /.*/ so
// the filename gate is a no-op — these cases exercise the pattern, window, and
// suppression logic, not glob routing (the engine test covers that).
function compiled(ruleId) {
  const r = byId[ruleId];
  assert.ok(r, `rule ${ruleId} must exist in the shell pack`);
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
  // -- curl|sh supply-chain pipe-to-shell -----------------------------------
  ["shell-curl-pipe-shell", "deploy.sh", "curl -fsSL https://get.example.com/install.sh | sh", true],
  ["shell-curl-pipe-shell", "deploy.sh", "wget -qO- https://x.example.com/i.sh | sudo bash", true],
  ["shell-curl-pipe-shell", "deploy.sh", "curl -fsSL https://x.example.com/i.sh | /usr/bin/bash", true],
  ["shell-curl-pipe-shell", "deploy.sh", "curl -fsSL https://x.example.com/i.sh -o install.sh", false],
  ["shell-curl-pipe-shell", "deploy.sh", "# curl https://x.example.com/i.sh | sh is forbidden", false],
  ["shell-curl-pipe-shell", "deploy.sh", "cat payload.txt | grep sh", false],

  // -- insecure TLS download -------------------------------------------------
  ["shell-insecure-tls-download", "deploy.sh", "curl -k https://x.example.com/i.sh -o i.sh", true],
  ["shell-insecure-tls-download", "deploy.sh", "curl --insecure https://x.example.com/a -o a", true],
  ["shell-insecure-tls-download", "deploy.sh", "wget --no-check-certificate https://x.example.com/a", true],
  ["shell-insecure-tls-download", "deploy.sh", "curl -K config https://x.example.com/a", false],
  ["shell-insecure-tls-download", "deploy.sh", "curl -fsSL https://x.example.com/i.sh -o i.sh", false],
  ["shell-insecure-tls-download", "deploy.sh", "# curl -k is not allowed here", false],

  // -- eval over an expansion ------------------------------------------------
  ["shell-eval-with-expansion", "deploy.sh", 'eval "$user_cmd"', true],
  ["shell-eval-with-expansion", "deploy.sh", "eval $(generate_command)", true],
  ["shell-eval-with-expansion", "deploy.sh", 'eval "echo static string"', false],
  ["shell-eval-with-expansion", "deploy.sh", "retrieval_count=5", false],

  // -- rm -rf at root (HARD) -------------------------------------------------
  ["shell-rm-rf-root", "deploy.sh", "rm -rf /", true],
  ["shell-rm-rf-root", "deploy.sh", "rm -fr /", true],
  ["shell-rm-rf-root", "deploy.sh", "rm -rf /$APP_HOME", true],
  ["shell-rm-rf-root", "deploy.sh", "rm -rf /*", true],
  ["shell-rm-rf-root", "deploy.sh", "rm -rf -- /", true],
  ["shell-rm-rf-root", "deploy.sh", "rm -rf -- /*", true],
  ["shell-rm-rf-root", "deploy.sh", "rm -rf ./node_modules", false],
  ["shell-rm-rf-root", "deploy.sh", 'rm -rf "$dir/sub"', false],
  ["shell-rm-rf-root", "deploy.sh", "rm -rf /tmp/cache", false],

  // -- rm -rf with a variable target (WARN) ----------------------------------
  ["shell-rm-rf-variable", "deploy.sh", "rm -rf $BUILD_DIR", true],
  ["shell-rm-rf-variable", "deploy.sh", 'rm -rf "$TARGET"', true],
  ["shell-rm-rf-variable", "deploy.sh", "rm -rf ./build", false],
  ["shell-rm-rf-variable", "deploy.sh", "rm -rf /tmp/cache", false],

  // -- chmod world-writable --------------------------------------------------
  ["shell-chmod-world-writable", "deploy.sh", "chmod 777 /var/www", true],
  ["shell-chmod-world-writable", "deploy.sh", "chmod -R 0666 /data", true],
  ["shell-chmod-world-writable", "deploy.sh", "chmod 0755 /app/bin", false],
  ["shell-chmod-world-writable", "deploy.sh", "chmod 644 config.yml", false],

  // -- ssh host-key verification disabled ------------------------------------
  ["shell-ssh-disable-host-key", "deploy.sh", "ssh -o StrictHostKeyChecking=no host", true],
  ["shell-ssh-disable-host-key", "deploy.sh", "scp -o StrictHostKeyChecking no f host:/tmp", true],
  ["shell-ssh-disable-host-key", "deploy.sh", "ssh -o StrictHostKeyChecking=yes host", false],
  ["shell-ssh-disable-host-key", "deploy.sh", "ssh -o StrictHostKeyChecking=accept-new host", false],
];

for (const [ruleId, file, line, expect] of CASES) {
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// Every pattern in the pack must compile with its declared flags — a broken
// regex would otherwise only surface at lint time on a real diff.
test("all shell pack rules compile", () => {
  for (const [id, r] of Object.entries(byId)) {
    assert.doesNotThrow(() => new RegExp(r.pattern, r.flags || ""), `rule ${id} regex must compile`);
  }
});
