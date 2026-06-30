#!/usr/bin/env node
// VENDORED: the canonical source of this file is the dotfiles repo
// (claude/scripts/invariant-lint.mjs, deployed to ~/.claude/scripts/).
// `/invariants-init` copies it into <repo>/scripts/invariant-lint.mjs so CI
// can run it without the dotfiles installed. Update the dotfiles copy first,
// then re-vendor.
//
// Rule-packs referenced by `.invariants.json` `extends` are resolved from
// <repo>/.invariants/packs/ (vendored by /invariants-init, preferred) and
// then ~/.claude/invariants/packs/ (the catalog). The resolution logic is
// identical for both locations — only the lookup order differs — so a
// vendored CI run and a local dotfiles run see the same rules.
/**
 * invariant-lint — generic, zero-dependency, config-driven invariant linter.
 *
 * Lints the ADDED lines of a git diff (not the whole tree) so it can run as
 * a required CI job / pre-push gate on every change without re-litigating
 * existing code.
 *
 * Usage:
 *   node invariant-lint.mjs [--base <ref>] [--head <ref>] [--staged]
 *                           [--config <path>] [--packs-dir <dir>] [--help]
 *
 *   --base <ref>     Diff `<ref>...<head>` (three-dot, merge-base).
 *                    Default: origin/HEAD, falling back to origin/main.
 *   --head <ref>     New-side ref to lint. Default: HEAD. Lets gates lint
 *                    the commit actually being pushed (`git push o src:dst`
 *                    while HEAD is elsewhere) instead of the checkout.
 *   --staged         Diff the index (`git diff --cached`) instead.
 *   --config <path>  Config file. Default: <repo-root>/.invariants.json.
 *                    With no config file, only the universal built-in HARD
 *                    rules run.
 *   --packs-dir <dir>  Extra rule-pack directory, searched FIRST (before
 *                    <repo>/.invariants/packs and ~/.claude/invariants/packs).
 *   --help           This text.
 *
 * Built-in HARD rules (always on, conservative):
 *   sql-interpolation     string-interpolated SQL handed to .prepare()/.exec()/
 *                         .query()/.raw() (JS/TS template literals with ${},
 *                         Python f-strings; .execute() also matched for Python).
 *   private-key           a committed `-----BEGIN ... PRIVATE KEY-----` block.
 *   hardcoded-credential  an obvious credential literal assigned to a
 *                         secret-named variable/key.
 *
 * Config-driven rules (.invariants.json — see ~/.claude/.invariants.example.json):
 *   extends               [pack-id, ...] of rule-packs to activate. Each id
 *                         resolves to <id>.json in, in order: --packs-dir,
 *                         <repo>/.invariants/packs/, ~/.claude/invariants/packs/.
 *                         Packs may themselves `extends` other packs
 *                         (cycles are detected and broken). Pack rules are
 *                         deduped by rule id; a local `rules` entry with the
 *                         same id overrides the pack's. Missing / malformed /
 *                         cyclic packs WARN to stderr and are skipped — pack
 *                         resolution never crashes the lint. Built-ins always
 *                         run regardless of packs.
 *   egressAllowlist       [glob, ...] of allowed hosts. HARD `rogue-egress` on
 *                         any added fetch()/axios/http.get/requests.get with a
 *                         string-LITERAL http(s)://host matching none.
 *                         Env-derived / no-literal calls are allowed. A pack
 *                         with `requireEgressAllowlist: true` makes an
 *                         empty/missing allowlist a WARN `egress-unconfigured`.
 *   requireTestWithSrc    `missing-test` when changed src has no matching test.
 *                         Two shapes, both honoring `severity` ("hard"|"warn",
 *                         default "warn" → unchanged WARN behavior; "hard"
 *                         exits 1; unknown → warn + stderr notice):
 *                           legacy flat: { enabled, srcGlobs[], testGlobs[],
 *                                          severity? } — one requirement.
 *                           per-kind:    { enabled, severity?, requirements: [
 *                                          { srcGlobs[], testGlobs[], message? },
 *                                          ... ] } — each requirement evaluated
 *                                          INDEPENDENTLY, so a web/** change can
 *                                          demand an e2e/** test (a unit test
 *                                          does NOT satisfy it) while a src/**
 *                                          change accepts any unit OR e2e test.
 *   rules                 [{ id, severity: "hard"|"warn", include: glob|[glob],
 *                            pattern: regex, flags?, message }] applied to
 *                         added lines.
 *
 * Output:  SEVERITY  [rule-id]  path:line — message
 * Exit:    1 only on HARD findings; 0 otherwise; 2 on internal/config error.
 *
 * Doctrine: ~/.claude/rules/generation-doctrine.md (run /selfreview).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import console from "node:console";
import process from "node:process";

function usage() {
  console.log(
    [
      "invariant-lint — generic, config-driven invariant gate (diff-based, zero-dependency)",
      "",
      "Usage: node invariant-lint.mjs [--base <ref>] [--head <ref>] [--staged]",
      "                               [--config <path>] [--packs-dir <dir>] [--help]",
      "  --base <ref>      diff <ref>...<head> (default: origin/HEAD, fallback origin/main)",
      "  --head <ref>      new-side ref to lint (default: HEAD; for non-HEAD pushes)",
      "  --staged          diff the staged index instead",
      "  --config <path>   config file (default: <repo-root>/.invariants.json)",
      "  --packs-dir <dir> extra rule-pack dir, searched before <repo>/.invariants/packs",
      "                    and ~/.claude/invariants/packs",
      "",
      "Built-in HARD (always): sql-interpolation, private-key, hardcoded-credential",
      "Config HARD: rogue-egress (egressAllowlist), pack/custom rules with severity \"hard\",",
      "             missing-test when requireTestWithSrc.severity is \"hard\"",
      "Config WARN: missing-test (requireTestWithSrc, default), egress-unconfigured,",
      "             pack/custom rules with severity \"warn\"",
      "requireTestWithSrc: { enabled, severity?, srcGlobs[], testGlobs[] } OR",
      "             { enabled, severity?, requirements: [{ srcGlobs[], testGlobs[],",
      "             message? }] } — per-requirement web->e2e vs src->any-test policy.",
      "Rule-packs: .invariants.json \"extends\": [\"typescript\", ...] — missing/",
      "            malformed/cyclic packs warn to stderr and are skipped, never fatal.",
      "",
      "Exit 1 only on HARD findings. Doctrine: ~/.claude/rules/generation-doctrine.md",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const opts = { base: null, head: null, staged: false, config: null, packsDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a === "--staged") {
      opts.staged = true;
    } else if (a === "--base") {
      const v = argv[++i];
      if (!v) fail("--base requires a ref");
      opts.base = v;
    } else if (a === "--head") {
      const v = argv[++i];
      if (!v) fail("--head requires a ref");
      opts.head = v;
    } else if (a === "--config") {
      const v = argv[++i];
      if (!v) fail("--config requires a path");
      opts.config = v;
    } else if (a === "--packs-dir") {
      const v = argv[++i];
      if (!v) fail("--packs-dir requires a directory");
      opts.packsDir = v;
    } else {
      console.error(`error: unknown argument ${a}`);
      usage();
      process.exit(2);
    }
  }
  return opts;
}

function fail(msg) {
  console.error(`invariant-lint: ${msg}`);
  process.exit(2);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function gitQuiet(args) {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

function gitShowRaw(spec) {
  try {
    return git(["show", spec]); // no trim — line numbers must stay exact
  } catch {
    return null;
  }
}

function resolveBase() {
  for (const ref of ["origin/HEAD", "origin/main"]) {
    if (gitQuiet(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) return ref;
  }
  fail("cannot resolve a base ref (no origin/HEAD or origin/main) — pass --base <ref>");
}

/** Minimal glob → RegExp: `**` spans `/`, `*` and `?` do not. */
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

function matchesAnyGlob(value, globs) {
  return globs.some((g) => globToRegExp(g).test(value));
}

function hostAllowed(hostWithPort, allowlist) {
  const host = hostWithPort.replace(/:\d+$/, "").toLowerCase();
  return allowlist.some((g) => {
    const glob = String(g).toLowerCase();
    if (globToRegExp(glob).test(host)) return true;
    // Convenience: `*.example.com` also allows the bare apex `example.com`.
    return glob.startsWith("*.") && host === glob.slice(2);
  });
}

function loadConfig(opts, repoRoot) {
  const configPath = opts.config
    ? path.resolve(opts.config)
    : path.join(repoRoot, ".invariants.json");
  if (!existsSync(configPath)) {
    if (opts.config) fail(`config not found: ${configPath}`);
    return { config: null, configPath: null };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    fail(`invalid JSON in ${configPath}: ${err.message}`);
  }
  // Keys starting with "//" are comments — ignore them.
  const config = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith("//")),
  );
  return { config, configPath };
}

// ---------------------------------------------------------------------------
// Rule-pack resolution. Packs are <id>.json files looked up, in order, in
// --packs-dir (if given), <repo>/.invariants/packs (vendored), and
// ~/.claude/invariants/packs (the catalog). Resolution is FAIL-SAFE by
// doctrine: a hostile or broken `extends` (missing id, traversal id,
// malformed JSON, circular extends) warns to stderr and is skipped — it must
// never crash the gate. Lookup logic is identical for every directory, so
// vendored CI runs and ~/.claude runs behave the same.
// ---------------------------------------------------------------------------

// Pack ids are bare names: no path separators, no leading dot — a hostile
// `extends: ["../../../etc/passwd"]` is rejected here, never joined to a path.
const PACK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function packWarn(msg) {
  console.error(`invariant-lint: ${msg}`);
}

function packsSearchDirs(opts, repoRoot) {
  const dirs = [];
  if (opts.packsDir) dirs.push(path.resolve(opts.packsDir));
  dirs.push(path.join(repoRoot, ".invariants", "packs"));
  try {
    dirs.push(path.join(os.homedir(), ".claude", "invariants", "packs"));
  } catch {
    // no resolvable home dir — vendored / --packs-dir lookups still work
  }
  return dirs;
}

/** Read one pack by id, or null (with a stderr warning) on any problem. */
function readPack(id, dirs) {
  if (typeof id !== "string" || !PACK_ID_RE.test(id) || id.includes("..")) {
    packWarn(`invalid pack id ${JSON.stringify(id)} — skipping`);
    return null;
  }
  for (const dir of dirs) {
    const p = path.join(dir, `${id}.json`);
    if (!existsSync(p)) continue;
    let raw;
    try {
      raw = JSON.parse(readFileSync(p, "utf8"));
    } catch (err) {
      packWarn(`malformed pack JSON ${p} (${err.message}) — skipping pack "${id}"`);
      return null;
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      packWarn(`pack ${p} is not a JSON object — skipping pack "${id}"`);
      return null;
    }
    // Keys starting with "//" are comments, same convention as the config.
    return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("//")));
  }
  packWarn(`pack "${id}" not found in [${dirs.join(", ")}] — skipping`);
  return null;
}

/**
 * Resolve `extends` recursively. Returns { packIds, rules, requireEgress }.
 * - `visiting` (the recursion stack) detects true cycles; `done` makes
 *   diamond-shaped extends (react→typescript, workers→typescript) resolve
 *   each pack exactly once without a spurious cycle warning.
 * - Rules dedupe by id; a pack listed later (or extending another) overrides
 *   an earlier pack's rule of the same id.
 */
function resolvePacks(extendsList, dirs) {
  const visiting = new Set();
  const done = new Set();
  const rulesById = new Map();
  const packIds = [];
  let requireEgress = false;

  const visit = (id, from) => {
    if (typeof id !== "string" || id === "") {
      packWarn(`non-string pack id in extends${from ? ` of "${from}"` : ""} — skipping`);
      return;
    }
    if (done.has(id)) return; // already resolved (diamond) — fine, no warning
    if (visiting.has(id)) {
      packWarn(`circular pack extends at "${id}"${from ? ` (via "${from}")` : ""} — breaking cycle`);
      return;
    }
    visiting.add(id);
    const pack = readPack(id, dirs);
    if (pack) {
      const parents = Array.isArray(pack.extends) ? pack.extends : [];
      if (pack.extends !== undefined && !Array.isArray(pack.extends)) {
        packWarn(`pack "${id}" has a non-array extends — ignoring it`);
      }
      for (const parent of parents) visit(parent, id);
      if (pack.requireEgressAllowlist === true) requireEgress = true;
      const rules = Array.isArray(pack.rules) ? pack.rules : [];
      if (pack.rules !== undefined && !Array.isArray(pack.rules)) {
        packWarn(`pack "${id}" has a non-array rules — ignoring it`);
      }
      for (const r of rules) {
        if (!r || typeof r !== "object" || typeof r.id !== "string" || r.id === "") {
          packWarn(`pack "${id}" has a rule without a string id — skipping that rule`);
          continue;
        }
        rulesById.set(r.id, r); // later/extending pack overrides earlier
      }
      packIds.push(id);
    }
    visiting.delete(id);
    done.add(id);
  };

  for (const id of extendsList) visit(id, null);
  return { packIds, rules: [...rulesById.values()], requireEgress };
}

/**
 * Lint the FULL new-side content of a changed file, with each line flagged
 * added/unchanged from the diff. Multiline state machines then always see
 * an unchanged opener (e.g. `db.query(\`` far above an added `${...}` line)
 * — findings are only ever reported when an ADDED line is involved. Falls
 * back to the diff hunk lines if the blob cannot be read (e.g. submodule).
 */
function fileLinesForLint(file, hunkLines, staged, head = "HEAD") {
  const spec = staged ? `:0:${file}` : `${head}:${file}`;
  const content = gitShowRaw(spec);
  if (content === null || content.includes("\u0000")) return hunkLines;
  const addedSet = new Set(hunkLines.filter((l) => l.added).map((l) => l.line));
  return content
    .split("\n")
    .map((text, i) => ({ line: i + 1, text, added: addedSet.has(i + 1) }));
}

/**
 * Parse a unified diff into Map<file, [{ line, text, added }]> of new-side
 * lines. Context lines are kept (added: false) so the hunk-lines fallback
 * in fileLinesForLint still sees nearby openers — findings are only ever
 * reported when an ADDED line is involved.
 */
function parseDiffLines(diffText) {
  const files = new Map();
  let file = null;
  let newLine = 0;
  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const p = raw.slice(4).trim();
      file = p === "/dev/null" ? null : p.replace(/^b\//, "");
      continue;
    }
    if (raw.startsWith("@@")) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (m) newLine = Number(m[1]);
      continue;
    }
    if (file === null) continue;
    if (raw.startsWith("+") || raw.startsWith(" ")) {
      if (!files.has(file)) files.set(file, []);
      files.get(file).push({ line: newLine, text: raw.slice(1), added: raw.startsWith("+") });
      newLine++;
    }
    // removed lines: new-side line number does not advance
  }
  return files;
}

const isTestPath = (f) =>
  /(^|\/)(test|tests|spec|specs|e2e|__tests__|__mocks__|fixtures)\//.test(f) ||
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) ||
  /(^|\/)test_[^/]+\.py$/.test(f) ||
  /_test\.(py|go|rb|ts|js)$/.test(f) ||
  /_spec\.rb$/.test(f);

const isJsLike = (f) => /\.[cm]?[jt]sx?$/.test(f);
const isPython = (f) => /\.py$/.test(f);

// ---------------------------------------------------------------------------
// Built-in HARD 1: string-interpolated SQL handed to a query API.
// JS/TS: `.prepare(` / `.exec(` / `.query(` / `.raw(` with a template literal
// containing `${` — same-line, or the template opens and the interpolation
// appears on a following added line.
// Python: the same calls (plus `.execute(`/`.executemany(`) with an f-string
// containing `{`.
// ---------------------------------------------------------------------------
const SQL_CALL = String.raw`\.(prepare|exec|query|raw)\s*\(`;
const SQL_INTERP_SAME_LINE = new RegExp(`${SQL_CALL}\\s*\`[^\`]*\\$\\{`);
const SQL_TEMPLATE_OPEN = new RegExp(`${SQL_CALL}\\s*\`[^\`]*$`);
const SQL_CALL_OPEN = new RegExp(`${SQL_CALL}\\s*$`); // arg on a following line
const SQL_ARG_INTERP = /^\s*`[^`]*\$\{/;
const SQL_ARG_TEMPLATE_OPEN = /^\s*`[^`]*$/;

// `.exec(` is shared with RegExp.exec, so for that method alone the template
// body must START with a SQL keyword (`someRegex.exec(\`${a}:${b}\`)` must
// not be a HARD finding). prepare/query/raw stay broad — they are query APIs.
const SQL_KEYWORD_RE =
  /^\s*(?:select|insert|update|delete|create|drop|alter|with|pragma|replace|begin|commit|rollback|vacuum|attach|detach|explain|grant|revoke|truncate|merge)\b/i;

// For exec: does this template body look like SQL? "yes" / "no", or "defer"
// when the body so far is only whitespace (decide on a later line).
function execBodySqlState(body) {
  if (/^\s*$/.test(body)) return "defer";
  return SQL_KEYWORD_RE.test(body) ? "yes" : "no";
}

const SQL_PY_CALL = String.raw`\.(?:prepare|exec|execute|executemany|query|raw)\s*\(`;
// f-string prefix: f / F, optionally combined with r / R in either order.
const PY_FSTRING_PREFIX = String.raw`(?:[fF][rR]?|[rR][fF])`;
const SQL_PY_FSTRING = new RegExp(`${SQL_PY_CALL}\\s*${PY_FSTRING_PREFIX}("""|'''|["'])`);
const SQL_PY_CALL_OPEN = new RegExp(`${SQL_PY_CALL}\\s*$`);
const SQL_PY_ARG_FSTRING = new RegExp(`^\\s*${PY_FSTRING_PREFIX}("""|'''|["'])`);

/**
 * Classify the body of an f-string after its opening quote. Escaped literal
 * braces (`{{`) are masked first so they do not count as interpolation; the
 * mask is same-length so the closing-quote index is unaffected.
 */
function fstringState(rest, quote) {
  const body = rest.replace(/\{\{/g, "\u0000\u0000");
  const close = body.indexOf(quote);
  const brace = body.indexOf("{");
  if (brace !== -1 && (close === -1 || brace < close)) return "interp";
  return close === -1 ? "open" : "closed";
}

function pushSqlFinding(findings, file, line, msg) {
  findings.push({ level: "HARD", rule: "sql-interpolation", loc: `${file}:${line}`, msg });
}

const PY_SQL_MSG = "f-string SQL passed to a query call — use bound parameters";
const JS_SQL_MSG =
  "SQL template literal passed to .prepare()/.exec()/.query()/.raw() interpolates ${...} — use bound parameters";

function lintPythonSqlInterpolation(file, lines, findings) {
  let open = null; // { line, quote, added } — unterminated f-string under scan
  let pendingCall = null; // call paren opened, f-string expected on the next line
  let prevLineNo = null;
  for (const { line, text, added } of lines) {
    const consecutive = prevLineNo !== null && line === prevLineNo + 1;
    if (!consecutive) {
      open = null;
      pendingCall = null;
    }
    prevLineNo = line;
    if (open) {
      const state = fstringState(text, open.quote);
      if (state === "interp" && (open.added || added)) {
        pushSqlFinding(findings, file, open.line, PY_SQL_MSG);
      }
      if (state === "open") open.added = open.added || added;
      else open = null;
      continue;
    }
    let m = null;
    let callLine = line;
    let spanAdded = added;
    if (pendingCall) {
      const argMatch = SQL_PY_ARG_FSTRING.exec(text);
      if (argMatch) {
        m = argMatch;
        callLine = pendingCall.line;
        spanAdded = pendingCall.added || added;
      }
      pendingCall = null;
    }
    if (!m) {
      m = SQL_PY_FSTRING.exec(text);
      if (m) {
        callLine = line;
        spanAdded = added;
      }
    }
    if (m) {
      const quote = m[1];
      const state = fstringState(text.slice(m.index + m[0].length), quote);
      if (state === "interp" && spanAdded) pushSqlFinding(findings, file, callLine, PY_SQL_MSG);
      else if (state === "open") open = { line: callLine, quote, added: spanAdded };
    } else if (SQL_PY_CALL_OPEN.test(text)) {
      pendingCall = { line, added };
    }
  }
}

function lintSqlInterpolation(file, lines, findings) {
  if (isTestPath(file)) return;
  if (isPython(file)) {
    lintPythonSqlInterpolation(file, lines, findings);
    return;
  }
  if (!isJsLike(file)) return;
  let open = null; // { line, added } — unterminated `.prepare(\`` template under scan
  let pendingCall = null; // call paren opened, template expected on the next line
  let prevLineNo = null;
  for (const { line, text, added } of lines) {
    const consecutive = prevLineNo !== null && line === prevLineNo + 1;
    if (!consecutive) {
      open = null; // template continued past the diff hunk
      pendingCall = null;
    }
    prevLineNo = line;
    if (open) {
      if (open.checkSql) {
        // `.exec(\`` opened with an all-whitespace body so far: the first
        // real content decides whether this is SQL or a RegExp/exec lookalike.
        if (/^\s*$/.test(text)) {
          open.added = open.added || added;
          continue;
        }
        if (!SQL_KEYWORD_RE.test(text)) {
          open = null;
          continue;
        }
        open.checkSql = false;
      }
      const backtick = text.indexOf("`");
      const interp = text.indexOf("${");
      if (interp !== -1 && (backtick === -1 || interp < backtick)) {
        if (open.added || added) pushSqlFinding(findings, file, open.line, JS_SQL_MSG);
        open = null;
      } else if (backtick !== -1) {
        open = null;
      } else {
        open.added = open.added || added;
      }
      continue;
    }
    if (pendingCall) {
      const callLine = pendingCall.line;
      const spanAdded = pendingCall.added || added;
      const callMethod = pendingCall.method;
      pendingCall = null;
      const isExec = callMethod === "exec";
      const argBody = () => text.slice(text.indexOf("`") + 1);
      if (SQL_ARG_INTERP.test(text)) {
        if (isExec && execBodySqlState(argBody()) !== "yes") continue;
        if (spanAdded) pushSqlFinding(findings, file, callLine, JS_SQL_MSG);
        continue;
      }
      if (SQL_ARG_TEMPLATE_OPEN.test(text)) {
        const sqlState = isExec ? execBodySqlState(argBody()) : "yes";
        if (sqlState === "no") continue;
        open = { line: callLine, added: spanAdded, checkSql: sqlState === "defer" };
        continue;
      }
    }
    let m;
    if ((m = SQL_INTERP_SAME_LINE.exec(text))) {
      const body = text.slice(text.indexOf("`", m.index) + 1);
      if (m[1] === "exec" && execBodySqlState(body) !== "yes") continue;
      if (added) pushSqlFinding(findings, file, line, JS_SQL_MSG);
    } else if ((m = SQL_TEMPLATE_OPEN.exec(text))) {
      const body = text.slice(text.indexOf("`", m.index) + 1);
      const sqlState = m[1] === "exec" ? execBodySqlState(body) : "yes";
      if (sqlState === "no") continue;
      open = { line, added, checkSql: sqlState === "defer" };
    } else if ((m = SQL_CALL_OPEN.exec(text))) {
      pendingCall = { line, added, method: m[1] };
    }
  }
}

// ---------------------------------------------------------------------------
// Built-in HARD 2: committed private key block.
// ---------------------------------------------------------------------------
const PRIVATE_KEY_RE = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;

function lintPrivateKey(file, lines, findings) {
  if (isTestPath(file)) return;
  for (const { line, text, added } of lines) {
    if (!added) continue;
    if (PRIVATE_KEY_RE.test(text)) {
      findings.push({
        level: "HARD",
        rule: "private-key",
        loc: `${file}:${line}`,
        msg: "private key block committed — remove it and rotate the key",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Built-in HARD 3: obvious hardcoded credential literal.
// Conservative: a secret-named key/var assigned a quoted literal of 8+ chars,
// excluding env lookups and obvious placeholders.
// ---------------------------------------------------------------------------
const CRED_RE =
  /(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret)["']?\s*[:=]+\s*["']([^"']{8,})["']/i;
const ENV_LOOKUP_RE = /process\.env|os\.environ|getenv|ENV\[|import\.meta\.env|\bsecrets\./;
const PLACEHOLDER_RE =
  /\$\{|\{\{|%s|<[^>]*>|\b(?:example|changeme|change[_-]me|placeholder|dummy|sample|your[_-]?\w*|xxx+|todo|redacted|fake|test)\b/i;

function lintHardcodedCredential(file, lines, findings) {
  if (isTestPath(file)) return;
  for (const { line, text, added } of lines) {
    if (!added) continue;
    if (ENV_LOOKUP_RE.test(text)) continue;
    const m = CRED_RE.exec(text);
    if (!m) continue;
    if (PLACEHOLDER_RE.test(m[1])) continue;
    findings.push({
      level: "HARD",
      rule: "hardcoded-credential",
      loc: `${file}:${line}`,
      msg: "hardcoded credential literal — load it from the environment / secret store and rotate it",
    });
  }
}

// ---------------------------------------------------------------------------
// Config HARD: rogue-egress — literal-host outbound call not on the allowlist.
// The negative lookbehind excludes method calls (`stub.fetch(`) which are
// bindings/clients, not raw network egress. Env-derived calls with no literal
// host are allowed (validate the host at runtime instead).
// ---------------------------------------------------------------------------
const EGRESS_CALLEE = String.raw`(?<![\w.$])(?:fetch|axios(?:\.\w+)?|https?\.(?:get|request)|requests\.(?:get|post|put|patch|delete|head|request)|urlopen)\s*\(`;
// Host stops at path (/), query (?), fragment (#), quote, or whitespace.
const EGRESS_URL = String.raw`[\`"'](https?:\/\/[^\/\`"'\s?#]+)`;
const EGRESS_RE = new RegExp(`${EGRESS_CALLEE}\\s*${EGRESS_URL}`);
const EGRESS_CALL_OPEN = new RegExp(`${EGRESS_CALLEE}\\s*$`); // URL on a following line
const EGRESS_URL_ARG = new RegExp(`^\\s*${EGRESS_URL}`);

function lintRogueEgress(file, lines, allowlist, findings) {
  if (isTestPath(file)) return;
  let pendingCall = null; // call paren opened, URL literal expected on the next line
  let prevLineNo = null;
  for (const { line, text, added } of lines) {
    const consecutive = prevLineNo !== null && line === prevLineNo + 1;
    if (!consecutive) pendingCall = null;
    prevLineNo = line;
    let m = null;
    let callLine = line;
    let spanAdded = added;
    if (pendingCall) {
      const argMatch = EGRESS_URL_ARG.exec(text);
      if (argMatch) {
        m = argMatch;
        callLine = pendingCall.line;
        spanAdded = pendingCall.added || added;
      }
      pendingCall = null;
    }
    if (!m) {
      m = EGRESS_RE.exec(text);
      if (m) {
        callLine = line;
        spanAdded = added;
      }
    }
    if (!m) {
      if (EGRESS_CALL_OPEN.test(text)) pendingCall = { line, added };
      continue;
    }
    if (!spanAdded) continue;
    const host = m[1].replace(/^https?:\/\//, "");
    if (!hostAllowed(host, allowlist)) {
      findings.push({
        level: "HARD",
        rule: "rogue-egress",
        loc: `${file}:${callLine}`,
        msg: `outbound call to literal host "${host}" not in egressAllowlist [${allowlist.join(", ")}]`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Config: missing-test — src changed without a matching test change.
//
// Two config shapes, both honoring `severity` ("hard"|"warn", default "warn"
// so existing configs are unchanged → identical WARN behavior):
//
//   Legacy flat:  { enabled, srcGlobs[], testGlobs[], severity? }
//                 treated as a SINGLE requirement.
//   requirements: { enabled, severity?, requirements: [
//                     { srcGlobs[], testGlobs[], message? }, ... ] }
//                 each requirement is evaluated INDEPENDENTLY — a web/** change
//                 can demand an e2e/** test while a src/** change accepts any
//                 unit OR e2e test. A unit test does not satisfy a UI change.
//
// `severity: "hard"` makes a missing test a HARD finding (exit 1). An unknown
// severity falls back to warn with a one-line stderr notice — never a crash.
// ---------------------------------------------------------------------------

/** Map a configured severity ("hard"|"warn") to a finding level. Unknown
 *  values degrade to WARN with a stderr notice — this must never crash. */
function resolveMissingTestLevel(severity) {
  if (severity === undefined || severity === null) return "WARN";
  const s = String(severity).toLowerCase();
  if (s === "hard") return "HARD";
  if (s === "warn") return "WARN";
  packWarn(
    `requireTestWithSrc has unknown severity ${JSON.stringify(severity)} — treating as "warn"`,
  );
  return "WARN";
}

/**
 * Evaluate ONE requirement against the changed files and push at most one
 * finding. `touchesSrc` = files matching srcGlobs but NOT testGlobs (so a test
 * file that also matches a broad src glob is never itself counted as the
 * untested src). `hasTest` = any changed file matches testGlobs. Empty globs
 * on either side make the requirement a no-op (nothing to enforce).
 */
function checkTestRequirement(changedFiles, req, level, findings) {
  if (!req || typeof req !== "object") return;
  const srcGlobs = Array.isArray(req.srcGlobs) ? req.srcGlobs : [];
  const testGlobs = Array.isArray(req.testGlobs) ? req.testGlobs : [];
  if (srcGlobs.length === 0 || testGlobs.length === 0) return;
  const touchesSrc = changedFiles.filter(
    (f) => matchesAnyGlob(f, srcGlobs) && !matchesAnyGlob(f, testGlobs),
  );
  const hasTest = changedFiles.some((f) => matchesAnyGlob(f, testGlobs));
  if (touchesSrc.length > 0 && !hasTest) {
    findings.push({
      level,
      rule: "missing-test",
      loc: touchesSrc[0],
      msg:
        req.message ||
        `diff touches ${touchesSrc.length} file(s) matching [${srcGlobs.join(", ")}] ` +
          `with no matching test (expected one of [${testGlobs.join(", ")}]) — ` +
          "does an invariant-violating test cover this?",
    });
  }
}

function lintMissingTest(changedFiles, cfg, findings) {
  if (!cfg || cfg.enabled === false) return;
  const level = resolveMissingTestLevel(cfg.severity);
  if (Array.isArray(cfg.requirements)) {
    // Per-kind form: each requirement enforced independently (symmetry — a
    // web→e2e rule and a src→any-test rule both get their own evaluation).
    for (const req of cfg.requirements) {
      checkTestRequirement(changedFiles, req, level, findings);
    }
    return;
  }
  // Legacy flat form — a single requirement, honoring severity (default warn
  // → byte-for-byte identical behavior to before this change).
  checkTestRequirement(
    changedFiles,
    { srcGlobs: cfg.srcGlobs, testGlobs: cfg.testGlobs, message: cfg.message },
    level,
    findings,
  );
}

// ---------------------------------------------------------------------------
// Config/pack: custom rules — { id, severity, include: glob|[glob...],
// pattern, flags?, message }. Local config rules compile STRICT (a typo in
// your own config should fail loudly, exit 2). Pack rules compile LENIENT
// (`lenient: true`): a bad regex / bad flags / missing field in a catalog
// pack warns to stderr and skips that one rule — a pack must never be able
// to crash the gate.
// ---------------------------------------------------------------------------
// `g`/`y` are rejected: they make RegExp.test stateful (lastIndex), which
// silently skips findings on subsequent lines.
const REGEX_FLAGS_RE = /^[imsu]*$/;

function compileCustomRules(rules, { lenient = false, source = "rules" } = {}) {
  if (rules !== undefined && rules !== null && !Array.isArray(rules)) {
    // Misclassifying a config error as findings (or a crash) would confuse
    // the push gate: strict configs fail loudly (exit 2), packs degrade.
    if (lenient) {
      packWarn(`"${source}" must be an array of rule objects — ignoring it`);
      return [];
    }
    fail(`config "${source}" must be an array of rule objects`);
  }
  const compiled = [];
  (rules || []).forEach((r, idx) => {
    const label = `${source}[${idx}]${r && r.id ? ` (${r.id})` : ""}`;
    const reject = (msg) => {
      if (lenient) packWarn(`${label} ${msg} — skipping rule`);
      else fail(`${label} ${msg}`);
    };
    if (!r || typeof r !== "object" || !r.id || !r.include || !r.pattern || !r.message) {
      reject("must have id, include, pattern, message");
      return;
    }
    const flags = r.flags === undefined ? "" : r.flags;
    if (typeof flags !== "string" || !REGEX_FLAGS_RE.test(flags)) {
      reject(`has invalid regex flags ${JSON.stringify(r.flags)}`);
      return;
    }
    let regex;
    try {
      regex = new RegExp(r.pattern, flags);
    } catch (err) {
      reject(`has an invalid pattern: ${err.message}`);
      return;
    }
    const includeGlobs = Array.isArray(r.include) ? r.include : [r.include];
    if (includeGlobs.length === 0 || !includeGlobs.every((g) => typeof g === "string" && g)) {
      reject("has an invalid include (must be a glob string or array of them)");
      return;
    }
    // Optional `exclude` key: glob or array of globs. Files matching any
    // exclude glob are skipped even if they match an include glob. Silently
    // ignored if absent or empty so existing rules without the key are unaffected.
    const rawExclude = r.exclude === undefined ? [] : r.exclude;
    const excludeGlobs = Array.isArray(rawExclude) ? rawExclude : [rawExclude];
    if (!excludeGlobs.every((g) => typeof g === "string")) {
      reject("has an invalid exclude (must be a glob string or array of them)");
      return;
    }
    compiled.push({
      id: r.id,
      level: String(r.severity || "warn").toLowerCase() === "hard" ? "HARD" : "WARN",
      includes: includeGlobs.map(globToRegExp),
      excludes: excludeGlobs.filter(Boolean).map(globToRegExp),
      regex,
      message: r.message,
    });
  });
  return compiled;
}

// Extra lines a custom-rule regex may peek ahead. Lets patterns with a
// negative lookahead hunting a safe kwarg (e.g. yaml.load's Loader=) see the
// rest of a multi-line call instead of false-positing on the opener line.
const CUSTOM_RULE_WINDOW = 5;

function lintCustomRules(file, lines, customRules, findings) {
  const active = customRules.filter(
    (rule) =>
      rule.includes.some((re) => re.test(file)) &&
      !rule.excludes.some((re) => re.test(file)),
  );
  if (active.length === 0) return;
  for (let i = 0; i < lines.length; i++) {
    const { line, text, added } = lines[i];
    if (!added) continue;
    // Bounded lookahead buffer over consecutive lines. A finding is only
    // reported when the match STARTS on the added line itself, so windows of
    // adjacent lines never produce duplicate or mis-located findings.
    let buffer = text;
    for (let k = i + 1; k <= i + CUSTOM_RULE_WINDOW && k < lines.length; k++) {
      if (lines[k].line !== lines[k - 1].line + 1) break;
      buffer += "\n" + lines[k].text;
    }
    for (const rule of active) {
      rule.regex.lastIndex = 0;
      const m = rule.regex.exec(buffer);
      if (m && (m.index < text.length || (text.length === 0 && m.index === 0))) {
        // Inline suppression: `# noqa: <rule-id>` or `# noqa` on the matched
        // line silences this finding. Supports Dockerfile (`# noqa`),
        // shell/YAML comments, and any line where the comment is `# noqa`.
        // The rule-id form is preferred (`# noqa: docker-from-tag-not-digest-pinned`)
        // so reviewers can see which rule is being suppressed.
        // Require `#` before `noqa` so code tokens (e.g. `echo noqa`) are not
        // mistaken for suppression comments. Both bare (`# noqa`) and rule-id
        // forms (`# noqa: rule-id`) must start with a `#` comment marker.
        const noqaAll = /(?:^|\s)#\s*noqa\s*$/i.test(text);
        // Escape rule.id before using it as regex: dots and other metacharacters
        // must match literally so `corp.rule` cannot accidentally match `corpXrule`.
        const escapedId = rule.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const noqaId = new RegExp(
          `(?:^|\\s)#\\s*noqa:\\s*${escapedId}(?:\\s|$)`,
          "i",
        ).test(text);
        // Preceding-line suppression: a `# noqa` or `# noqa: <rule-id>`
        // comment on the line IMMEDIATELY before the matched line also
        // silences this finding. This is necessary for languages like
        // Dockerfile where inline `#` is not a comment (it becomes part of
        // the instruction value), so users cannot add an inline suppression
        // without corrupting the file.
        //
        // Acceptable forms for the preceding line:
        //   1. A standalone comment line: `# noqa: <id>` (the `#` is the
        //      first non-whitespace character). This may be added or
        //      unchanged — it is safe because the comment exists solely to
        //      grant a suppression and has no other meaning.
        //   2. An added code+inline-noqa line: `FROM builder # noqa: <id>`
        //      where `added: true`. This covers multi-stage Dockerfile alias
        //      references. Because the line was itself added in this diff, the
        //      author explicitly placed the suppression.
        //
        // NOT accepted: an EXISTING (added: false) code line that has an
        // inline `# noqa` for its OWN violation — this must not silently
        // carry over to suppress a newly-added violation on the next line.
        // Example: `FROM builder # noqa: docker-from-tag-not-digest-pinned`
        // that was already in the file should not suppress a new `FROM`
        // instruction added immediately after it.
        //
        // Only fires when the preceding line number is exactly line-1 (i.e.
        // it is truly the line above, not a gap in the hunk).
        const prevLine = i > 0 ? lines[i - 1] : null;
        const prevIsAdjacent =
          prevLine != null && prevLine.line === line - 1;
        const prevIsStandalone =
          prevIsAdjacent && /^\s*#/.test(prevLine.text);
        const prevIsAddedInline =
          prevIsAdjacent && prevLine.added === true && !prevIsStandalone;
        const prevEligible = prevIsStandalone || prevIsAddedInline;
        const prevText = prevEligible ? prevLine.text : "";
        const noqaPrevAll = /(?:^|\s)#\s*noqa\s*$/i.test(prevText);
        const noqaPrevId = new RegExp(
          `(?:^|\\s)#\\s*noqa:\\s*${escapedId}(?:\\s|$)`,
          "i",
        ).test(prevText);
        // Go-style suppression: any `//nolint` comment on the matched line
        // silences this finding, but ONLY for Go files (`.go` extension).
        // Go files use `//` comments, not `#`, so `# noqa` is not valid Go
        // syntax. Both bare (`//nolint`) and linter-scoped forms
        // (`//nolint:gosec`, `//nolint:govet`) are accepted — the linter
        // names in Go tooling (gosec, govet, ...) differ from invariant-lint
        // rule ids, so any `//nolint` in a Go file indicates deliberate
        // developer intent. Restricting to `.go` prevents Terraform HCL,
        // YAML, and other files that happen to use `//` comments from
        // accidentally bypassing HARD pack findings.
        const isGoFile = /\.go$/.test(file);
        const nolint = isGoFile && /\/\/\s*nolint\b/i.test(text);
        // JS/TS-style suppression: `// noqa: <rule-id>` or `// noqa` on the
        // matched line for files that use `//` comment syntax (.js, .jsx,
        // .ts, .tsx, .mjs, .cjs, .mts, .cts). Mirrors the `# noqa` behaviour
        // for hash-comment files. The preceding-line form is also supported:
        // a standalone `// noqa: <id>` comment on the line immediately above
        // silences the finding for the same reasons as `# noqa` does there.
        const isJsLikeFile = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/.test(file);
        const jsNoqaAll =
          isJsLikeFile && /(?:^|\s)\/\/\s*noqa\s*$/i.test(text);
        const jsNoqaId =
          isJsLikeFile &&
          new RegExp(
            `(?:^|\\s)\\/\\/\\s*noqa:\\s*${escapedId}(?:\\s|$)`,
            "i",
          ).test(text);
        // Preceding-line JS/TS suppression: a STANDALONE `// noqa` comment
        // line (starts with `//`) on the line immediately before the matched
        // line. Inline code+noqa on the preceding line is intentionally NOT
        // accepted: since `//` is already valid inline on the matched line
        // itself, allowing it on the line BEFORE would suppress a second
        // violation on the following line (`eval(a); // noqa` then `eval(b)`
        // would bypass both), weakening HARD findings unintentionally.
        const prevIsJsStandalone =
          isJsLikeFile &&
          prevIsAdjacent &&
          /^\s*\/\//.test(prevLine?.text ?? "");
        const prevJsText = prevIsJsStandalone ? (prevLine?.text ?? "") : "";
        const jsNoqaPrevAll =
          isJsLikeFile && /(?:^|\s)\/\/\s*noqa\s*$/i.test(prevJsText);
        const jsNoqaPrevId =
          isJsLikeFile &&
          new RegExp(
            `(?:^|\\s)\\/\\/\\s*noqa:\\s*${escapedId}(?:\\s|$)`,
            "i",
          ).test(prevJsText);
        if (
          noqaAll ||
          noqaId ||
          noqaPrevAll ||
          noqaPrevId ||
          nolint ||
          jsNoqaAll ||
          jsNoqaId ||
          jsNoqaPrevAll ||
          jsNoqaPrevId
        )
          continue;
        findings.push({
          level: rule.level,
          rule: rule.id,
          loc: `${file}:${line}`,
          msg: rule.message,
        });
      }
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const repoRoot = gitQuiet(["rev-parse", "--show-toplevel"]);
  if (!repoRoot) fail("not inside a git repository");

  const { config, configPath } = loadConfig(opts, repoRoot);

  // Resolve rule-packs (config `extends`). FAIL-SAFE: any error in pack
  // resolution degrades to built-ins + local rules — never a crash.
  let packs = { packIds: [], rules: [], requireEgress: false };
  const extendsVal = config?.extends;
  if (extendsVal !== undefined && !Array.isArray(extendsVal)) {
    packWarn(`config "extends" must be an array of pack ids — ignoring it`);
  } else if (Array.isArray(extendsVal) && extendsVal.length > 0) {
    try {
      packs = resolvePacks(extendsVal, packsSearchDirs(opts, repoRoot));
    } catch (err) {
      packWarn(`pack resolution failed (${err.message}) — continuing with built-ins + local rules`);
      packs = { packIds: [], rules: [], requireEgress: false };
    }
  }

  // Local rules compile strict (your own config failing loudly is a feature);
  // pack rules compile lenient (a catalog pack must never crash the gate).
  // A local rule overrides a pack rule with the same id.
  const localRules = compileCustomRules(config?.rules);
  const localIds = new Set(localRules.map((r) => r.id));
  const packRules = compileCustomRules(
    packs.rules.filter((r) => !localIds.has(r.id)),
    { lenient: true, source: "pack rule" },
  );
  const customRules = [...packRules, ...localRules];

  if (opts.staged && opts.head) fail("--head cannot be combined with --staged");
  const base = opts.staged ? null : opts.base || resolveBase();
  const head = opts.staged ? null : opts.head || "HEAD";
  if (head && head !== "HEAD" && !gitQuiet(["rev-parse", "--verify", "--quiet", `${head}^{commit}`])) {
    fail(`--head ref does not resolve to a commit: ${head}`);
  }
  const range = opts.staged ? "staged index" : `${base}...${head}`;
  // unified=2 keeps a little context so multiline state machines can see an
  // unchanged call opener (e.g. `db.query(`) above an added argument line.
  const diffArgs = opts.staged
    ? ["diff", "--cached", "--unified=2", "--no-color"]
    : ["diff", `${base}...${head}`, "--unified=2", "--no-color"];
  const nameArgs = opts.staged
    ? ["diff", "--cached", "--name-only"]
    : ["diff", `${base}...${head}`, "--name-only"];

  let diffText, changedFiles;
  try {
    diffText = git(diffArgs);
    changedFiles = git(nameArgs).split("\n").filter(Boolean);
  } catch (err) {
    fail(`git diff failed: ${err.message}`);
  }

  const added = parseDiffLines(diffText);
  const findings = [];
  const allowlist = Array.isArray(config?.egressAllowlist) ? config.egressAllowlist : null;
  // An egress-checked pack with no allowlist declared is a misconfiguration:
  // the repo opted into egress discipline but nothing is being checked
  // against a real host list. WARN, don't guess an allowlist.
  if (packs.requireEgress && (!allowlist || allowlist.length === 0)) {
    findings.push({
      level: "WARN",
      rule: "egress-unconfigured",
      loc: configPath ? path.relative(repoRoot, configPath) : ".invariants.json",
      msg:
        `pack(s) [${packs.packIds.join(", ")}] require egress allowlisting but ` +
        "egressAllowlist is empty/missing — declare the repo's legitimate outbound hosts",
    });
  }
  for (const [file, hunkLines] of added) {
    if (!hunkLines.some((l) => l.added)) continue; // pure deletions
    const lines = fileLinesForLint(file, hunkLines, opts.staged, head);
    lintSqlInterpolation(file, lines, findings);
    lintPrivateKey(file, lines, findings);
    lintHardcodedCredential(file, lines, findings);
    if (allowlist) lintRogueEgress(file, lines, allowlist, findings);
    lintCustomRules(file, lines, customRules, findings);
  }
  lintMissingTest(changedFiles, config?.requireTestWithSrc, findings);

  const configNote = configPath ? path.relative(repoRoot, configPath) : "built-ins only";
  const packNote = packs.packIds.length ? `; packs: ${packs.packIds.join(", ")}` : "";
  console.log(
    `invariant-lint: ${range} — ${changedFiles.length} changed file(s) (${configNote}${packNote})`,
  );
  if (findings.length === 0) {
    console.log("invariant-lint: clean — no findings.");
    process.exit(0);
  }
  for (const f of findings) {
    console.log(`  ${f.level}  [${f.rule}]  ${f.loc} — ${f.msg}`);
  }
  const hard = findings.filter((f) => f.level === "HARD");
  console.log(
    `invariant-lint: ${hard.length} HARD, ${findings.length - hard.length} WARN — ` +
      (hard.length
        ? "FAILING (fix HARD findings; doctrine: ~/.claude/rules/generation-doctrine.md, run /selfreview)"
        : "passing with warnings"),
  );
  process.exit(hard.length ? 1 : 0);
}

// Named exports for unit testing. Importing this module must NOT run the CLI.
export { lintMissingTest, checkTestRequirement, resolveMissingTestLevel, lintCustomRules };

// Run main() only when this file is the process entrypoint (invoked directly,
// e.g. `node invariant-lint.mjs`), never when imported by a test. Prefer the
// runtime flag, fall back to comparing the resolved entry path to this module.
// The fallback also follows symlinks so that installs where ~/.claude/scripts
// is a symlink to the dotfiles repo (e.g. via install.sh) continue to work on
// Node versions that lack import.meta.main.
const invokedDirectly = (() => {
  if (typeof import.meta.main === "boolean") return import.meta.main;
  if (!process.argv[1]) return false;
  const realArgv = (() => {
    try {
      return realpathSync(process.argv[1]);
    } catch {
      return path.resolve(process.argv[1]);
    }
  })();
  const realSelf = (() => {
    const self = fileURLToPath(import.meta.url);
    try {
      return realpathSync(self);
    } catch {
      return path.resolve(self);
    }
  })();
  return realArgv === realSelf;
})();
if (invokedDirectly) main();
