// Regression coverage for the REAL rule-pack patterns (go / docker / terraform),
// driven through the REAL lintCustomRules engine. Engine mechanics are covered
// by invariant-lint.test.mjs; this file pins the pack REGEXES so a future edit
// that breaks a security rule (stops matching a violation, or starts matching a
// safe line) fails CI. Each case attacks or exonerates one rule:
//   expect:true  = a violation that MUST be flagged
//   expect:false = a safe line that must NOT be flagged
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { lintCustomRules } from "./invariant-lint.mjs";

const PACK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "invariants", "packs");

// Index every rule across the packs by id.
const byId = {};
for (const id of ["go", "docker", "terraform", "secrets"]) {
  const pack = JSON.parse(readFileSync(path.join(PACK_DIR, `${id}.json`), "utf8"));
  for (const r of pack.rules) byId[r.id] = r;
}

// Compile one pack rule into the engine's internal shape. includes is /.*/ so
// the filename gate is a no-op — these cases exercise the pattern, window, and
// suppression logic, not glob routing (which the engine test already covers).
function compiled(ruleId) {
  const r = byId[ruleId];
  assert.ok(r, `rule ${ruleId} must exist in a pack`);
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
  // -- Go --------------------------------------------------------------------
  ["go-sql-string-concat-query", "q.go", 'db.Query("SELECT * FROM u WHERE id = " + id)', true],
  ["go-sql-string-concat-query", "q.go", 'db.QueryContext(ctx, "SELECT * FROM u WHERE id = " + id)', true],
  ["go-sql-string-concat-query", "q.go", 'db.QueryContext(r.Context(), "SELECT * FROM u WHERE id = " + id)', true],
  ["go-sql-string-concat-query", "q.go", 'db.ExecContext(context.Background(), "DELETE FROM t WHERE key = " + key)', true],
  ["go-sql-string-concat-query", "q.go", "db.Query(`SELECT * FROM u WHERE id = ` + id)", true],
  ["go-sql-string-concat-query", "q.go", "db.QueryContext(r.Context(), `SELECT * FROM u WHERE id = ` + id)", true],
  ["go-sql-string-concat-query", "q.go", 'db.Query("SELECT * FROM u WHERE id = $1", id)', false],
  ["go-sql-string-concat-query", "q.go", 'db.Query(query, "prefix" + value)', false],
  ["go-sql-string-concat-query", "q.go", 'db.Exec(stmt, "prefix" + value)', false],
  ["go-ssh-ignore-host-key", "s.go", "HostKeyCallback: ssh.InsecureIgnoreHostKey(),", true],
  ["go-ssh-ignore-host-key", "s.go", "HostKeyCallback: ssh.FixedHostKey(pub),", false],
  ["go-tls-min-version-old", "t.go", "MinVersion: tls.VersionTLS10,", true],
  ["go-tls-min-version-old", "t.go", "MinVersion: tls.VersionTLS12,", false],
  ["go-rsa-key-too-short", "r.go", "rsa.GenerateKey(rand.Reader, 1024)", true],
  ["go-rsa-key-too-short", "r.go", "rsa.GenerateKey(rand.Reader, 2048)", false],
  ["go-jwt-none-alg", "j.go", "token.SignedString(jwt.SigningMethodNone)", true],
  ["go-jwt-none-alg", "j.go", "jwt.NewWithClaims(jwt.SigningMethodNone, claims)", true],
  ["go-jwt-none-alg", "j.go", "return jwt.UnsafeAllowNoneSignatureType, nil", true],
  ["go-jwt-none-alg", "j.go", "if token.Method == jwt.SigningMethodNone { return err }", false],
  ["go-jwt-none-alg", "j.go", "if method != jwt.SigningMethodNone { return nil }", false],
  ["go-jwt-none-alg", "j.go", "token.SignedString(jwt.SigningMethodHS256)", false],
  ["go-grpc-with-insecure", "g.go", "grpc.Dial(addr, grpc.WithInsecure())", true],
  ["go-grpc-with-insecure", "g.go", "grpc.WithTransportCredentials(creds)", false],
  ["go-template-html-unescaped", "h.go", "return template.HTML(userContent)", true],
  ["go-template-html-unescaped", "h.go", 'return template.HTML("<br>")', false],

  // -- Docker ----------------------------------------------------------------
  ["docker-run-insecure-tls-flag", "Dockerfile", "RUN curl -k https://x/i.sh -o i.sh", true],
  ["docker-run-insecure-tls-flag", "Dockerfile", "RUN wget --no-check-certificate https://x/a", true],
  ["docker-run-insecure-tls-flag", "Dockerfile", "RUN curl --insecure https://x/a -o a", true],
  ["docker-run-insecure-tls-flag", "Dockerfile", "RUN set -eux; \\\n    curl -k https://x/i.sh -o i.sh", true],
  ["docker-run-insecure-tls-flag", "Dockerfile", "RUN set -eux; \\\n    wget --no-check-certificate https://x/a", true],
  ["docker-run-insecure-tls-flag", "Dockerfile", "RUN curl -sSL https://x/i.sh -o i.sh", false],
  ["docker-run-insecure-tls-flag", "Dockerfile", "RUN curl -K myconfig https://x/a", false],
  ["docker-run-insecure-tls-flag", "Dockerfile", "# curl -k is forbidden here", false],
  ["docker-run-insecure-tls-flag", "Dockerfile", "# Example: wget --no-check-certificate https://x/a", false],
  ["docker-pip-trusted-host", "Dockerfile", "RUN pip install --trusted-host pypi.org foo", true],
  ["docker-pip-trusted-host", "Dockerfile", "RUN pip3 install --index-url http://pypi/simple foo", true],
  ["docker-pip-trusted-host", "Dockerfile", "RUN set -eux; \\\n    pip install --trusted-host pypi.org foo", true],
  ["docker-pip-trusted-host", "Dockerfile", "RUN set -eux; \\\n    pip3 install --extra-index-url http://pypi/simple foo", true],
  ["docker-pip-trusted-host", "Dockerfile", "RUN pip install foo bar", false],
  ["docker-pip-trusted-host", "Dockerfile", "# pip install --trusted-host pypi.org is an insecure pattern", false],
  ["docker-env-secret-literal", "Dockerfile", "ENV DB_PASSWORD=hunter2value", true],
  ["docker-env-secret-literal", "Dockerfile", "ENV API_TOKEN $BUILD_TOKEN", false],
  ["docker-env-secret-literal", "Dockerfile", "ENV DB_PASSWORD=changeme", false],
  ["docker-env-secret-literal", "Dockerfile", "ENV LANG=en_US.UTF-8", false],
  ["docker-chmod-world-writable", "Dockerfile", "RUN chmod -R 777 /app", true],
  ["docker-chmod-world-writable", "Dockerfile", "RUN set -eux; \\\n    chmod 777 /app", true],
  ["docker-chmod-world-writable", "Dockerfile", "# chmod 777 allowed in dev", false],
  ["docker-chmod-world-writable", "Dockerfile", "RUN chmod 0755 /app/bin", false],
  ["docker-run-sudo", "Dockerfile", "RUN sudo apt-get update", true],
  ["docker-run-sudo", "Dockerfile", "RUN set -eux; \\\n    sudo apt-get install -y curl", true],
  ["docker-run-sudo", "Dockerfile", "# sudo is not allowed", false],
  ["docker-run-sudo", "Dockerfile", "RUN apt-get install -y curl", false],
  ["docker-expose-ssh", "Dockerfile", "EXPOSE 22", true],
  ["docker-expose-ssh", "Dockerfile", "EXPOSE 8080 22", true],
  ["docker-expose-ssh", "Dockerfile", "EXPOSE 2222", false],
  ["docker-expose-ssh", "Dockerfile", "EXPOSE 8080", false],

  // -- Terraform -------------------------------------------------------------
  ["terraform-public-access-block-disabled", "main.tf", "  block_public_acls = false", true],
  ["terraform-public-access-block-disabled", "main.tf", "  block_public_acls = true", false],
  ["terraform-rds-publicly-accessible", "main.tf", "  publicly_accessible = true", true],
  ["terraform-rds-publicly-accessible", "main.tf", "  publicly_accessible = false", false],
  ["terraform-storage-unencrypted", "main.tf", "  storage_encrypted = false", true],
  ["terraform-storage-unencrypted", "main.tf", "  encrypted = false", true],
  ["terraform-storage-unencrypted", "main.tf", "  storage_encrypted = true", false],
  ["terraform-iam-principal-wildcard", "main.tf", '      "Principal": "*",', true],
  ["terraform-iam-principal-wildcard", "main.tf", '      "AWS": "*"', true],
  ["terraform-iam-principal-wildcard", "main.tf", '      "Principal": {"AWS": "arn:aws:iam::1:root"}', false],
  ["terraform-skip-final-snapshot", "main.tf", "  skip_final_snapshot = true", true],
  ["terraform-skip-final-snapshot", "main.tf", "  skip_final_snapshot = false", false],
  ["terraform-provisioner-exec", "main.tf", '  provisioner "local-exec" {', true],
  ["terraform-provisioner-exec", "main.tf", '  provisioner "file" {', false],
  ["terraform-weak-tls-policy", "main.tf", '  minimum_protocol_version = "TLSv1.1"', true],
  ["terraform-weak-tls-policy", "main.tf", '  minimum_protocol_version = "TLSv1.2_2021"', false],

  // -- Secrets: infra-metadata (regression pins for the false-positive fix
  // that motivated the ,\s*\S tightening — jmaredia flagged both the true
  // positive on device-identity main.go and the false positive on the
  // config_test.go env-var slice literal).
  ["secrets-infra-metadata-field-key", "main.go", '\t\t"identity_table", cfg.IdentityTable,', true],
  ["secrets-infra-metadata-field-key", "main.go", '\t\t"table", tableName,', true],
  ["secrets-infra-metadata-field-key", "main.go", '    "role_arn", roleARN,', true],
  ["secrets-infra-metadata-field-key", "main.go", '    "account_id", accountID,', true],
  // Slice-literal element on its own line: comma with nothing after must NOT
  // match. This is the config_test.go:16 case.
  ["secrets-infra-metadata-field-key", "config.go", '\t"IDENTITY_TABLE",', false],
  ["secrets-infra-metadata-field-key", "config.go", '\t"AWS_REGION",', false],
  ["secrets-infra-metadata-field-key", "config.go", '\t"IDENTITY_TABLE",  ', false],
  // Cross-line case: slice literal with the NEXT element on the following
  // line. The engine lints inside a multi-line lookahead buffer, so a naive
  // `\s*\S` after the comma would cross the newline and match the next
  // element's opening quote. The [^\S\n]* horizontal-only whitespace class
  // in the pack pattern is what prevents this. If someone loosens it back
  // to \s*, this case regresses.
  ["secrets-infra-metadata-field-key", "config.go", '\t"IDENTITY_TABLE",\n\t"AWS_REGION",', false],
  ["secrets-infra-metadata-field-key", "config.go", '\t"table",\n\t"port",', false],
  // Inline-comment case: slice literal element followed by a language comment
  // on the same line. The naive `,\s*\S` would treat the `//`/`#` opener as a
  // matching non-whitespace token; the (?!//|#|/\*) negative lookahead is
  // what excludes it. A regression that drops the lookahead re-noises this.
  ["secrets-infra-metadata-field-key", "config.go", '\t"IDENTITY_TABLE", // required', false],
  ["secrets-infra-metadata-field-key", "config.go", '\t"table", /* env var */', false],
  ["secrets-infra-metadata-field-key", "config.py", '    "table",  # comment', false],
  // Log field-key + value + trailing comment should STILL fire — the value
  // comes before the comment.
  ["secrets-infra-metadata-field-key", "main.go", '\t"table", tableName, // note', true],
  ["secrets-infra-metadata-in-info-log", "main.go", 'log.Info("starting", "identity_table", cfg.Table)', true],
  ["secrets-infra-metadata-in-info-log", "main.go", 'slog.Info("ready", "role_arn", roleARN)', true],
  ["secrets-infra-metadata-in-info-log", "main.go", 'log.Info("starting", "port", port)', false],
];

for (const [ruleId, file, line, expect] of CASES) {
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// Every pattern in every pack must compile with its declared flags — a broken
// regex would otherwise only surface at lint time on a real diff.
test("all pack rules compile", () => {
  for (const [id, r] of Object.entries(byId)) {
    assert.doesNotThrow(() => new RegExp(r.pattern, r.flags || ""), `rule ${id} regex must compile`);
  }
});

// The infra-metadata rules exclude conventional test files. A regression that
// removes the `exclude` key would silently re-introduce the noise the fix was
// meant to eliminate. Pin the list — additions are fine, removals must be
// deliberate.
test("secrets-infra-metadata rules exclude test files", () => {
  const requiredExcludes = [
    "**/*_test.go",
    "**/test_*.py",
    "**/*_test.py",
    "**/*_spec.rb",
    "**/*_test.rb",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*.test.tsx",
    "**/*.spec.tsx",
    "**/*.test.js",
    "**/*.spec.js",
  ];
  for (const id of ["secrets-infra-metadata-in-info-log", "secrets-infra-metadata-field-key"]) {
    const rule = byId[id];
    assert.ok(Array.isArray(rule.exclude), `${id} must declare an exclude array`);
    for (const glob of requiredExcludes) {
      assert.ok(
        rule.exclude.includes(glob),
        `${id} exclude must include ${glob} (removing this re-noises the pack)`,
      );
    }
  }
});
