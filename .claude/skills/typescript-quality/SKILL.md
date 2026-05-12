---
name: typescript-quality
description: "Enforce TypeScript/JavaScript code quality standards. Use when writing, editing, refactoring, or reviewing TypeScript (.ts, .tsx), JavaScript (.js, .jsx, .mjs, .cjs), tsconfig.json, package.json, or related configs; when scaffolding a new Node/React/Next.js project; or when the user mentions eslint, prettier, tsc, vitest, jest, biome, or 'TypeScript linting'. Codifies tsc strict + ESLint (typescript-eslint) + Prettier + Vitest/Jest + npm audit conventions."
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# TypeScript Quality Standards

Apply this skill whenever touching TypeScript or JavaScript. The goal is strict types, narrow runtime surface, fast feedback loops, and zero `any` in shipped code.

## 0. Detect, don't impose

```bash
ls package.json tsconfig.json .eslintrc* eslint.config.* .prettierrc* biome.json deno.json 2>/dev/null
jq -r '.packageManager // empty' package.json 2>/dev/null
jq -r '.scripts | keys[]' package.json 2>/dev/null
ls pnpm-lock.yaml yarn.lock package-lock.json bun.lockb 2>/dev/null
```

- **Package manager:** `pnpm-lock.yaml` → pnpm. `yarn.lock` → yarn. `package-lock.json` → npm. `bun.lockb` → bun. Use what's there.
- **Lint stack:** `biome.json` present → project uses **Biome** (replaces ESLint + Prettier). Run `biome check --apply .` instead. `eslint.config.*` → flat config (ESLint 9+).
- **Framework:** look for `next`, `vite`, `astro`, `remix`, `nest` in dependencies. Adopt their conventions where they exist.
- **No tsconfig** and scaffolding fresh → TypeScript 5.5+, target ES2022, strict on.

## 1. Required toolchain (canonical)

| Concern        | Tool                                              | Invocation                            |
| -------------- | ------------------------------------------------- | ------------------------------------- |
| Types          | TypeScript (strict)                               | `tsc --noEmit`                        |
| Lint           | ESLint + typescript-eslint (or Biome)             | `eslint . --fix`                      |
| Format         | Prettier (or Biome)                               | `prettier --write .`                  |
| Tests          | Vitest (preferred for new) or Jest                | `vitest run` / `jest`                 |
| Coverage       | Vitest --coverage / Jest --coverage               | `vitest run --coverage`               |
| Vulnerable deps| npm audit / pnpm audit / `osv-scanner`            | `pnpm audit --prod`                   |
| Pre-commit     | husky + lint-staged                               | `pnpm exec lint-staged`               |

Install (pnpm example):

```bash
pnpm add -D typescript eslint @eslint/js typescript-eslint prettier vitest @vitest/coverage-v8
pnpm add -D eslint-config-prettier eslint-plugin-import eslint-plugin-unicorn
```

## 2. Default `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,

    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,

    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist", "build", ".next"]
}
```

The flags above the blank line are the non-negotiable strict set. Drop `noUncheckedIndexedAccess` only if migrating a legacy codebase and the user agrees.

## 3. Default `eslint.config.js` (flat config, ESLint 9+)

```js
// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import unicorn from "eslint-plugin-unicorn";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "build", "coverage", ".next", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs["flat/recommended"],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { import: importPlugin },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "import/order": ["error", {
        "newlines-between": "always",
        groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
        alphabetize: { order: "asc", caseInsensitive: true },
      }],
      "unicorn/prevent-abbreviations": "off",
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },
  prettier,  // disables stylistic rules that conflict with Prettier — must be last
);
```

## 4. Default `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

## 5. Idioms to keep and to reject

```ts
// REJECT — any, untyped catch
function parse(input: any) {
  try { return JSON.parse(input); }
  catch (e) { return null; }
}

// ACCEPT — narrow input, typed unknown error
function parse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

// REJECT — non-null assertion to silence the compiler
const user = users.find((u) => u.id === id)!;

// ACCEPT — handle the absent case
const user = users.find((u) => u.id === id);
if (!user) throw new NotFoundError(`user ${id}`);

// REJECT — floating promise (lint will catch)
fetchData();

// ACCEPT — await, or explicit fire-and-forget
await fetchData();
void fetchData();           // intentional, with reasoning comment if non-obvious

// REJECT — enums (prefer literal unions, smaller emit, structural)
enum Role { Admin, User }

// ACCEPT
type Role = "admin" | "user";
const ROLES = ["admin", "user"] as const;
```

Core rules:

- **No `any`.** Use `unknown` and narrow.
- **No `as` casts** except (a) `as const`, (b) narrowing after a runtime check, (c) crossing a known-unsafe boundary with a `// SAFETY:` comment.
- **`interface` for object contracts, `type` for unions / aliases.** Be consistent within a file.
- **`readonly` everywhere it's true** — function params, fields, arrays (`readonly T[]`).
- **Discriminated unions** for state — `{ status: "loading" } | { status: "ok"; data: T } | { status: "err"; error: Error }`. Use `switch` with exhaustiveness check.
- **Branded types** for IDs that share a primitive shape — `type UserId = string & { readonly __brand: "UserId" }`.
- **`zod`/`valibot`/`@sinclair/typebox`** at runtime boundaries (HTTP in, env vars, JSON files). Infer TS types from the schema, never duplicate.
- **Avoid `null`** when `undefined` works — pick one per codebase. JSON crossings excepted.
- **Side-effect free modules.** Top-level should be declarations only.

## 6. Project layout

```
myapp/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── src/
│   ├── index.ts
│   ├── server.ts
│   └── domain/...
├── tests/                  # or co-located *.test.ts next to source
└── dist/                   # gitignored
```

- Co-located `*.test.ts` is fine for libraries; a `tests/` dir is fine for apps. Pick one.
- `index.ts` barrel files only at package boundaries — internal barrels slow tooling and create cycles.

## 7. Testing standards (Vitest shown; Jest equivalent)

```ts
import { describe, expect, it, vi } from "vitest";
import { InvoiceGenerator } from "./invoice-generator";

describe("InvoiceGenerator", () => {
  it("totals usage line items in cents", () => {
    const generator = new InvoiceGenerator({
      events: [
        { occurredAt: new Date("2026-01-01"), cents: 100 },
        { occurredAt: new Date("2026-01-31"), cents: 250 },
      ],
    });

    expect(generator.total()).toBe(350);
  });

  it.each([
    ["free", 0],
    ["pro", 100],
    ["ent", 50],
  ] as const)("discount for %s plan is %i cents", (plan, expected) => {
    expect(discountCents(plan, 100)).toBe(expected);
  });
});
```

- `describe` per unit under test; `it` describes the behaviour, not the implementation.
- Use `vi.useFakeTimers()` / `vi.setSystemTime()` instead of asserting against `Date.now`.
- Mock at the **module boundary** (`vi.mock("./db")`), never internal functions of the same module.
- For React, prefer **Testing Library** + queries by role/label — not by class names or test IDs.
- Snapshots: only for stable serializable output (graphs, generated code). Never for UI as primary assertion.
- `it.todo`, `it.skip` are commits — write the title so a future reader knows the missing case.

## 8. Pre-merge gate

```bash
pnpm tsc --noEmit
pnpm eslint .
pnpm prettier --check .
pnpm vitest run --coverage
pnpm audit --prod --audit-level=high   # or: npx osv-scanner ./
```

All exit 0. `--fix` and `--write` versions are safe to run first locally.

## 9. `package.json` script standard

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test"
  }
}
```

The `check` script is what CI runs and what you run before claiming done.

## 10. Pre-commit (husky + lint-staged)

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs,cjs}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ]
  }
}
```

```bash
pnpm dlx husky init
echo "pnpm exec lint-staged" > .husky/pre-commit
```

## 11. Things to never silently introduce

- `// @ts-ignore` — use `// @ts-expect-error <reason>` if absolutely necessary; the error must fire when the issue is fixed.
- `// eslint-disable-next-line` without a rule name and a reason.
- New runtime dependencies — name them to the user before adding.
- `Function`, `Object`, `{}` as types. Use `(...args: never[]) => unknown`, `Record<string, unknown>`, or `object` as appropriate.
- `JSON.parse` without a runtime schema validation at trust boundaries.
- `dangerouslySetInnerHTML` / `eval` / `new Function(...)` without explicit user sign-off and sanitization context.
- `process.env.X` access scattered through code — centralize in a `src/env.ts` that validates with Zod at startup and exports a typed object.
