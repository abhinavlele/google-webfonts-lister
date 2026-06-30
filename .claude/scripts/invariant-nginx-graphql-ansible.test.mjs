// Regression coverage for the nginx / graphql / ansible rule-packs, driven
// through the REAL lintCustomRules engine. Engine mechanics are covered by
// invariant-lint.test.mjs; this file pins the pack REGEXES so a future edit
// that breaks a security rule (stops matching a violation, or starts matching
// a safe line) fails CI. Each case attacks or exonerates one rule:
//   expect:true  = a violation that MUST be flagged
//   expect:false = a safe line that must NOT be flagged
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { lintCustomRules } from "./invariant-lint.mjs";

const PACK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "invariants", "packs");

// Index every rule across the three packs by id.
const byId = {};
for (const id of ["nginx", "graphql", "ansible"]) {
  const pack = JSON.parse(readFileSync(path.join(PACK_DIR, `${id}.json`), "utf8"));
  for (const r of pack.rules) byId[r.id] = r;
}

const level = (r) =>
  String(r.severity || "warn").toLowerCase() === "hard" ? "HARD" : "WARN";

// Compile one pack rule into the engine's internal shape. includes is /.*/ so
// the filename gate is a no-op — these cases exercise the pattern, window, and
// suppression logic, not glob routing (covered separately below + by the
// engine test).
function compiled(ruleId) {
  const r = byId[ruleId];
  assert.ok(r, `rule ${ruleId} must exist in a pack`);
  return {
    id: r.id,
    level: level(r),
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
  // -- nginx -----------------------------------------------------------------
  ["nginx-weak-tls-protocols", "nginx.conf", "  ssl_protocols TLSv1 TLSv1.1 TLSv1.2;", true],
  ["nginx-weak-tls-protocols", "nginx.conf", "  ssl_protocols SSLv3;", true],
  ["nginx-weak-tls-protocols", "nginx.conf", "  ssl_protocols TLSv1.1 TLSv1.2;", true],
  ["nginx-weak-tls-protocols", "nginx.conf", "  ssl_protocols TLSv1.2 TLSv1.3;", false],
  ["nginx-weak-tls-protocols", "nginx.conf", "  ssl_protocols TLSv1.3;", false],
  ["nginx-server-tokens-on", "nginx.conf", "  server_tokens on;", true],
  ["nginx-server-tokens-on", "nginx.conf", "  server_tokens off;", false],
  ["nginx-autoindex-on", "nginx.conf", "  autoindex on;", true],
  ["nginx-autoindex-on", "nginx.conf", "  autoindex off;", false],
  ["nginx-proxy-ssl-verify-off", "nginx.conf", "  proxy_ssl_verify off;", true],
  ["nginx-proxy-ssl-verify-off", "nginx.conf", "  proxy_ssl_verify on;", false],

  // -- graphql ---------------------------------------------------------------
  ["graphql-introspection-enabled", "server.ts", "  introspection: true,", true],
  ["graphql-introspection-enabled", "server.ts", "  introspection: false,", false],
  ["graphql-introspection-enabled", "server.ts", "  introspection: isDev,", false],
  ["graphql-ide-enabled", "server.ts", "  playground: true,", true],
  ["graphql-ide-enabled", "server.js", "  graphiql: true,", true],
  ["graphql-ide-enabled", "server.ts", "  playground: false,", false],
  ["graphql-ide-enabled", "server.ts", "  graphiql: process.env.NODE_ENV !== 'production',", false],

  // -- ansible ---------------------------------------------------------------
  ["ansible-validate-certs-disabled", "playbook.yml", "    validate_certs: no", true],
  ["ansible-validate-certs-disabled", "playbook.yml", "    validate_certs: false", true],
  ["ansible-validate-certs-disabled", "playbook.yml", "    validate_certs: False", true],
  ["ansible-validate-certs-disabled", "playbook.yml", "    validate_certs: yes", false],
  ["ansible-validate-certs-disabled", "playbook.yml", "    validate_certs: true", false],
  ["ansible-become-enabled", "playbook.yml", "  become: yes", true],
  ["ansible-become-enabled", "playbook.yml", "  become: true", true],
  ["ansible-become-enabled", "playbook.yml", "  become: false", false],
  ["ansible-become-enabled", "playbook.yml", "  become_user: root", false],
  ["ansible-shell-command-jinja", "playbook.yml", "    shell: rm -rf {{ target_dir }}", true],
  ["ansible-shell-command-jinja", "playbook.yml", "    command: /usr/bin/foo {{ user_arg }}", true],
  ["ansible-shell-command-jinja", "playbook.yml", "    ansible.builtin.shell: echo {{ value }}", true],
  ["ansible-shell-command-jinja", "playbook.yml", "    shell: systemctl restart nginx", false],
  ["ansible-shell-command-jinja", "playbook.yml", "    command: /usr/bin/true", false],
];

for (const [ruleId, file, line, expect] of CASES) {
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// --- Glob routing ----------------------------------------------------------
// The cases above neutralize the include gate (/.*/). These exercise the REAL
// include globs to confirm a rule routes to its own file types and not to
// foreign ones. globToRegExp mirrors the engine's minimal globber (** spans
// "/", * and ? do not) so routing here matches a real lint run.
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

function compiledRealIncludes(ruleId) {
  const r = byId[ruleId];
  const includeGlobs = Array.isArray(r.include) ? r.include : [r.include];
  return {
    id: r.id,
    level: level(r),
    includes: includeGlobs.map(globToRegExp),
    excludes: [],
    regex: new RegExp(r.pattern, r.flags || ""),
    message: r.message,
  };
}

function flaggedRouted(ruleId, file, text) {
  const findings = [];
  const lines = text.split("\n").map((t, i) => ({ line: i + 1, text: t, added: true }));
  lintCustomRules(file, lines, [compiledRealIncludes(ruleId)], findings);
  return findings.length > 0;
}

// [ruleId, file, line, expectFlagged] — same violating line, routed by the
// real include globs: matches when the filename is in scope, skipped otherwise.
const ROUTING = [
  ["nginx-weak-tls-protocols", "nginx.conf", "ssl_protocols SSLv3;", true],
  ["nginx-weak-tls-protocols", "conf.d/ssl.conf", "ssl_protocols SSLv3;", true],
  ["nginx-weak-tls-protocols", "src/app.ts", "ssl_protocols SSLv3;", false],
  ["ansible-validate-certs-disabled", "playbook.yml", "validate_certs: no", true],
  ["ansible-validate-certs-disabled", "roles/web/tasks/main.yml", "validate_certs: no", true],
  ["ansible-validate-certs-disabled", "nginx.conf", "validate_certs: no", false],
];

for (const [ruleId, file, line, expect] of ROUTING) {
  const verb = expect ? "routes+flags" : "skips (out of glob)";
  test(`routing ${ruleId} @ ${file}: ${verb}`, () => {
    assert.equal(flaggedRouted(ruleId, file, line), expect);
  });
}

// Every pattern in every pack must compile with its declared flags — a broken
// regex would otherwise only surface at lint time on a real diff.
test("all pack rules compile", () => {
  for (const [id, r] of Object.entries(byId)) {
    assert.doesNotThrow(() => new RegExp(r.pattern, r.flags || ""), `rule ${id} regex must compile`);
  }
});
