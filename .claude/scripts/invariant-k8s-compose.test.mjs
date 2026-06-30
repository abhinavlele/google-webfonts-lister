// Regression coverage for the kubernetes / docker-compose rule-pack patterns,
// driven through the REAL lintCustomRules engine. Engine mechanics are covered
// by invariant-lint.test.mjs; this file pins the YAML pack REGEXES so a future
// edit that breaks a security rule (stops matching a violation, or starts
// matching a safe lookalike) fails CI. Each case attacks or exonerates one rule:
//   expect:true  = a violation that MUST be flagged
//   expect:false = a safe line that must NOT be flagged
//
// The include globs for these packs are broad (**/*.yaml for k8s, compose-named
// files for compose), so a false positive blocks a real engineer's push — every
// rule therefore has at least one safe-lookalike negative case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { lintCustomRules } from "./invariant-lint.mjs";

const PACK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "invariants", "packs");

// Index every rule across both YAML packs by id.
const byId = {};
for (const id of ["kubernetes", "docker-compose"]) {
  const pack = JSON.parse(readFileSync(path.join(PACK_DIR, `${id}.json`), "utf8"));
  for (const r of pack.rules) byId[r.id] = r;
}

// Minimal glob -> RegExp identical to the engine's globToRegExp: `**` spans
// `/`, `*`/`?` do not. Used only by the glob-routing cases below to confirm a
// rule's include globs route the right filenames.
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

// Compile one pack rule into the engine's internal shape. `routed` controls the
// include gate: when false (default) includes is /.*/ so the filename is a
// no-op and the case exercises the PATTERN; when true the real include globs
// are compiled so the case exercises GLOB ROUTING.
function compiled(ruleId, routed = false) {
  const r = byId[ruleId];
  assert.ok(r, `rule ${ruleId} must exist in a pack`);
  const includeGlobs = Array.isArray(r.include) ? r.include : [r.include];
  return {
    id: r.id,
    level: String(r.severity || "warn").toLowerCase() === "hard" ? "HARD" : "WARN",
    includes: routed ? includeGlobs.map(globToRegExp) : [/.*/],
    excludes: [],
    regex: new RegExp(r.pattern, r.flags || ""),
    message: r.message,
  };
}

function flagged(ruleId, file, text, routed = false) {
  const findings = [];
  // Every split line is marked added so the case drives the added-line path.
  const lines = text.split("\n").map((t, i) => ({ line: i + 1, text: t, added: true }));
  lintCustomRules(file, lines, [compiled(ruleId, routed)], findings);
  return findings.length > 0;
}

// [ruleId, file, line, expectFlagged] — pattern cases (filename is a no-op).
const CASES = [
  // -- Kubernetes ------------------------------------------------------------
  ["k8s-privileged-container", "pod.yaml", "    privileged: true", true],
  ["k8s-privileged-container", "pod.yaml", '    privileged: "true"', true],
  ["k8s-privileged-container", "pod.yaml", "    privileged: false", false],
  ["k8s-privileged-container", "pod.yaml", "  # privileged: true is forbidden", false],

  ["k8s-host-namespace", "pod.yaml", "  hostNetwork: true", true],
  ["k8s-host-namespace", "pod.yaml", "  hostPID: true", true],
  ["k8s-host-namespace", "pod.yaml", "  hostIPC: true", true],
  ["k8s-host-namespace", "pod.yaml", "  hostNetwork: false", false],
  ["k8s-host-namespace", "pod.yaml", "  hostname: web-0", false],

  ["k8s-allow-privilege-escalation", "pod.yaml", "    allowPrivilegeEscalation: true", true],
  ["k8s-allow-privilege-escalation", "pod.yaml", "    allowPrivilegeEscalation: false", false],

  ["k8s-run-as-non-root-false", "pod.yaml", "    runAsNonRoot: false", true],
  ["k8s-run-as-non-root-false", "pod.yaml", "    runAsNonRoot: true", false],

  ["k8s-run-as-root-uid", "pod.yaml", "    runAsUser: 0", true],
  ["k8s-run-as-root-uid", "pod.yaml", "    runAsUser: 1000", false],
  ["k8s-run-as-root-uid", "pod.yaml", "    fsGroup: 0", false],

  ["k8s-image-latest-tag", "pod.yaml", "    image: nginx:latest", true],
  ["k8s-image-latest-tag", "pod.yaml", '    image: "myreg:5000/app:latest"', true],
  ["k8s-image-latest-tag", "pod.yaml", "    image: nginx:1.21.0", false],
  ["k8s-image-latest-tag", "pod.yaml", "    image: app:latest-debian", false],
  ["k8s-image-latest-tag", "pod.yaml", "    imagePullPolicy: Always", false],

  ["k8s-dangerous-capability", "pod.yaml", '        add: ["SYS_ADMIN"]', true],
  ["k8s-dangerous-capability", "pod.yaml", "        add: [NET_ADMIN]", true],
  ["k8s-dangerous-capability", "pod.yaml", "        add:\n          - SYS_ADMIN", true],
  ["k8s-dangerous-capability", "pod.yaml", "        add:\n          - NET_BIND_SERVICE\n          - NET_ADMIN", true],
  ["k8s-dangerous-capability", "pod.yaml", "        drop:\n          - ALL", false],
  ["k8s-dangerous-capability", "pod.yaml", "        add:\n          - NET_BIND_SERVICE", false],
  ["k8s-dangerous-capability", "pod.yaml", "        add: []\n        drop:\n          - ALL", false],

  ["k8s-hostpath-docker-socket", "pod.yaml", "    path: /var/run/docker.sock", true],
  ["k8s-hostpath-docker-socket", "pod.yaml", "    path: /run/docker.sock", true],
  ["k8s-hostpath-docker-socket", "pod.yaml", "    path: /data/config", false],

  ["k8s-automount-service-account-token", "pod.yaml", "  automountServiceAccountToken: true", true],
  ["k8s-automount-service-account-token", "pod.yaml", "  automountServiceAccountToken: false", false],

  // -- Docker Compose --------------------------------------------------------
  ["compose-privileged", "docker-compose.yml", "    privileged: true", true],
  ["compose-privileged", "docker-compose.yml", "    privileged: false", false],

  ["compose-network-mode-host", "docker-compose.yml", "    network_mode: host", true],
  ["compose-network-mode-host", "docker-compose.yml", '    network_mode: "host"', true],
  ["compose-network-mode-host", "docker-compose.yml", "    network_mode: bridge", false],
  ["compose-network-mode-host", "docker-compose.yml", "    network_mode: service:db", false],

  ["compose-docker-socket-mount", "docker-compose.yml", "      - /var/run/docker.sock:/var/run/docker.sock", true],
  ["compose-docker-socket-mount", "docker-compose.yml", "        source: /var/run/docker.sock", true],
  ["compose-docker-socket-mount", "docker-compose.yml", "      - ./app:/app", false],
  ["compose-docker-socket-mount", "docker-compose.yml", "      - db-data:/var/lib/postgresql/data", false],

  ["compose-dangerous-capability", "docker-compose.yml", "    cap_add:\n      - SYS_ADMIN", true],
  ["compose-dangerous-capability", "docker-compose.yml", "    cap_add: [NET_ADMIN]", true],
  ["compose-dangerous-capability", "docker-compose.yml", "    cap_drop:\n      - ALL", false],
  ["compose-dangerous-capability", "docker-compose.yml", "    cap_add:\n      - NET_BIND_SERVICE", false],

  ["compose-publish-all-interfaces", "docker-compose.yml", '      - "0.0.0.0:8080:8080"', true],
  ["compose-publish-all-interfaces", "docker-compose.yml", '      - "127.0.0.1:8080:8080"', false],
  ["compose-publish-all-interfaces", "docker-compose.yml", '      - "8080:8080"', false],
];

for (const [ruleId, file, line, expect] of CASES) {
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// Glob-routing cases: real filenames + the rule's actual include globs, to
// confirm the broad k8s globs and the compose-named globs route correctly.
// [ruleId, file, line, expectRouted]
const ROUTING_CASES = [
  // k8s rule routes any .yaml/.yml ...
  ["k8s-privileged-container", "manifests/deployment.yaml", "    privileged: true", true],
  // ... but not a non-YAML file, even with a matching line.
  ["k8s-privileged-container", "config.json", "    privileged: true", false],
  // compose rule routes a compose-named file ...
  ["compose-privileged", "docker-compose.yml", "    privileged: true", true],
  ["compose-privileged", "stack.compose.yaml", "    privileged: true", true],
  // ... but not a plain deployment.yaml (those are the k8s pack's domain).
  ["compose-privileged", "deployment.yaml", "    privileged: true", false],
];

for (const [ruleId, file, line, expect] of ROUTING_CASES) {
  const verb = expect ? "routes+flags" : "does not route";
  test(`${ruleId} glob routing: ${verb} ${JSON.stringify(file)}`, () => {
    assert.equal(flagged(ruleId, file, line, true), expect);
  });
}

// Every pattern in every pack must compile with its declared flags — a broken
// regex would otherwise only surface at lint time on a real diff.
test("all k8s/compose pack rules compile", () => {
  for (const [id, r] of Object.entries(byId)) {
    assert.doesNotThrow(() => new RegExp(r.pattern, r.flags || ""), `rule ${id} regex must compile`);
  }
});
