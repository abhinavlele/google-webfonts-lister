// Regression coverage for the csharp / php / rust rule-pack patterns, driven
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
for (const id of ["csharp", "php", "rust"]) {
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
  // -- C# --------------------------------------------------------------------
  ["csharp-jsonnet-typenamehandling", "a.cs", "settings.TypeNameHandling = TypeNameHandling.Auto;", true],
  ["csharp-jsonnet-typenamehandling", "a.cs", "var s = new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.All };", true],
  ["csharp-jsonnet-typenamehandling", "a.cs", "settings.TypeNameHandling = TypeNameHandling.None;", false],
  ["csharp-binaryformatter", "a.cs", "var formatter = new BinaryFormatter();", true],
  ["csharp-binaryformatter", "a.cs", "var formatter = new JsonSerializer();", false],
  ["csharp-sql-string-concat", "a.cs", 'var cmd = new SqlCommand("SELECT * FROM u WHERE id = " + userId, conn);', true],
  ["csharp-sql-string-concat", "a.cs", 'cmd.CommandText = "SELECT id FROM t WHERE name = " + name;', true],
  ["csharp-sql-string-concat", "a.cs", 'var cmd = new SqlCommand("SELECT * FROM u WHERE id = @id", conn);', false],
  ["csharp-tls-cert-validation-bypass", "a.cs", "ServicePointManager.ServerCertificateValidationCallback = (sender, cert, chain, errors) => true;", true],
  ["csharp-tls-cert-validation-bypass", "a.cs", "handler.ServerCertificateCustomValidationCallback += (m, c, ch, e) => true;", true],
  ["csharp-tls-cert-validation-bypass", "a.cs", "ServicePointManager.ServerCertificateValidationCallback = ValidateServerCertificate;", false],
  ["csharp-process-start-concat", "a.cs", 'Process.Start("cmd.exe /c " + userCommand);', true],
  ["csharp-process-start-concat", "a.cs", 'Process.Start("notepad.exe");', false],

  // -- PHP -------------------------------------------------------------------
  ["php-eval", "a.php", "eval($userCode);", true],
  ["php-eval", "a.php", "$x = medieval($code);", false],
  ["php-command-exec-var", "a.php", 'system("ls " . $dir);', true],
  ["php-command-exec-var", "a.php", "passthru($cmd);", true],
  ["php-command-exec-var", "a.php", 'system("ls -la");', false],
  ["php-command-exec-var", "a.php", "$pdo->exec($sql);", false],
  ["php-unserialize", "a.php", "$obj = unserialize($data);", true],
  ["php-unserialize", "a.php", "$obj = json_decode($data, true);", false],
  ["php-extract-superglobal", "a.php", "extract($_GET);", true],
  ["php-extract-superglobal", "a.php", "extract($config);", false],
  ["php-sql-interpolation", "a.php", '$res = $db->query("SELECT * FROM u WHERE id = $id");', true],
  ["php-sql-interpolation", "a.php", '$res = $db->query("SELECT * FROM u WHERE name = " . $name);', true],
  ["php-sql-interpolation", "a.php", '$res = mysql_query("DELETE FROM t WHERE k = $k");', true],
  ["php-sql-interpolation", "a.php", '$res = $db->query("SELECT * FROM u WHERE id = ?");', false],

  // -- Rust ------------------------------------------------------------------
  ["rust-command-shell-c", "a.rs", 'Command::new("sh").arg("-c").arg(user_input).spawn()?;', true],
  ["rust-command-shell-c", "a.rs", 'Command::new("/bin/bash")\n    .arg("-c")\n    .arg(cmd)', true],
  ["rust-command-shell-c", "a.rs", 'Command::new("sh").arg("script.sh").spawn()?;', false],
  ["rust-command-shell-c", "a.rs", 'Command::new("ls").arg("-la").output()?;', false],
  ["rust-mem-transmute", "a.rs", "let f: f32 = std::mem::transmute::<u32, f32>(bits);", true],
  ["rust-mem-transmute", "a.rs", "let p = mem::transmute(raw_ptr);", true],
  ["rust-mem-transmute", "a.rs", "let v = transmute(bytes);", true],
  ["rust-mem-transmute", "a.rs", "let x = my_transmute(ptr);", false],
  ["rust-mem-transmute", "a.rs", "let n = transmuter(ptr);", false],
  ["rust-sql-format", "a.rs", 'let rows = sqlx::query(&format!("SELECT * FROM t WHERE id = {}", id)).fetch_all(&pool).await?;', true],
  ["rust-sql-format", "a.rs", 'let u = query_as(&format!("SELECT * FROM users WHERE name = {}", n));', true],
  ["rust-sql-format", "a.rs", 'let rows = sqlx::query("SELECT * FROM t WHERE id = $1").bind(id).fetch_all(&pool).await?;', false],
];

for (const [ruleId, file, line, expect] of CASES) {
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// Every pattern in every pack must compile with its declared flags — a broken
// regex would otherwise only surface at lint time on a real diff.
test("all csharp/php/rust pack rules compile", () => {
  for (const [id, r] of Object.entries(byId)) {
    assert.doesNotThrow(() => new RegExp(r.pattern, r.flags || ""), `rule ${id} regex must compile`);
  }
});
