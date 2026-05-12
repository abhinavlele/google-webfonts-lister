---
name: go-quality
description: "Enforce Go code quality standards. Use when writing, editing, refactoring, or reviewing Go (.go) code, go.mod/go.sum, or Go module configs; when scaffolding a new Go module; or when the user mentions golangci-lint, gofmt, goimports, govulncheck, staticcheck, or 'Go linting'. Codifies golangci-lint + go vet + govulncheck + go test conventions."
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# Go Quality Standards

Apply this skill whenever touching Go code. The goal is idiomatic, race-free, vetted Go that follows Effective Go and the Google Go Style Guide.

## 0. Detect, don't impose

```bash
ls go.mod go.sum .golangci.yml .golangci.yaml Makefile 2>/dev/null
go version 2>/dev/null
grep -E "^go " go.mod 2>/dev/null
```

- `.golangci.yml` exists → respect, only tighten with user consent.
- `go.mod` Go directive sets the floor. New modules: use the current stable (1.23+).
- Vendored deps (`vendor/`) → never reformat or auto-update vendored files.

## 1. Required toolchain (canonical)

| Concern         | Tool                          | Invocation                                    |
| --------------- | ----------------------------- | --------------------------------------------- |
| Format          | gofmt + goimports (or gofumpt) | `gofmt -s -w .` / `goimports -w .`           |
| Lint (meta)     | golangci-lint                 | `golangci-lint run --fix ./...`               |
| Vet             | go vet                        | `go vet ./...`                                |
| Static analysis | staticcheck (via golangci)    | included in golangci config                   |
| Tests + race    | go test                       | `go test -race -shuffle=on ./...`             |
| Coverage        | go test -cover                | `go test -coverprofile=cover.out ./...`       |
| Vulnerable deps | govulncheck                   | `govulncheck ./...`                           |
| Mod hygiene     | go mod tidy                   | `go mod tidy`                                 |
| Benchmarks      | go test -bench                | `go test -bench=. -benchmem -run=^$ ./...`    |

Install:

```bash
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
go install golang.org/x/vuln/cmd/govulncheck@latest
go install golang.org/x/tools/cmd/goimports@latest
```

## 2. Default `.golangci.yml`

Only drop in when missing. Conservative-but-strict baseline:

```yaml
version: "2"

run:
  timeout: 5m
  tests: true
  modules-download-mode: readonly

linters:
  default: none
  enable:
    - errcheck         # unchecked errors
    - govet            # standard vet
    - ineffassign      # unused assignments
    - staticcheck      # bug + simplification suite (includes gosimple, stylecheck)
    - unused           # dead code
    - gosec            # security analysis
    - revive           # style/lint (replaces golint)
    - gocritic         # opinionated checks
    - copyloopvar      # Go 1.22+ loop var
    - misspell
    - unconvert        # redundant type conversions
    - prealloc         # slice preallocation hints
    - bodyclose        # http response body must close
    - rowserrcheck     # sql.Rows.Err
    - sqlclosecheck    # sql.Rows/Stmt close
    - errorlint        # %w / errors.Is/As
    - nilerr           # return nil after non-nil err
    - contextcheck     # context propagation
    - exhaustive       # exhaustive switch on enums
    - nakedret         # naked returns in long funcs
    - tparallel        # t.Parallel misuse
  settings:
    revive:
      rules:
        - name: exported
        - name: var-naming
        - name: error-return
        - name: error-naming
        - name: if-return
        - name: increment-decrement
        - name: range
        - name: receiver-naming
        - name: time-naming
        - name: errorf
        - name: empty-block
        - name: superfluous-else
        - name: unused-parameter
        - name: unreachable-code
        - name: redefines-builtin-id
    gosec:
      excludes:
        - G104     # errcheck overlaps
    govet:
      enable-all: true
      disable:
        - fieldalignment   # noisy; opt in per-package
    errcheck:
      check-type-assertions: true
      check-blank: true
  exclusions:
    rules:
      - path: _test\.go
        linters: [errcheck, gosec, prealloc]

formatters:
  enable:
    - gofumpt
    - goimports
  settings:
    goimports:
      local-prefixes:
        - github.com/your-org

issues:
  max-issues-per-linter: 0
  max-same-issues: 0
```

## 3. Idioms to keep and to reject

```go
// REJECT — error swallowed
result, _ := doThing()

// ACCEPT — handle or annotate
result, err := doThing()
if err != nil {
    return fmt.Errorf("doThing: %w", err)
}

// REJECT — pointer to slice/map/chan/interface (already reference types)
func f(s *[]int)

// ACCEPT
func f(s []int)

// REJECT — stuttering name
package user
type UserService struct{}

// ACCEPT
package user
type Service struct{}

// REJECT — context.Background() in a request path
ctx := context.Background()
db.QueryContext(ctx, ...)

// ACCEPT — propagate
func Handler(ctx context.Context, ...) error {
    return db.QueryContext(ctx, ...)
}

// REJECT — non-wrapped error
return errors.New("failed to load user " + id)

// ACCEPT — formatted + wrapped
return fmt.Errorf("load user %s: %w", id, err)
```

Core rules:

- **Errors are values.** Wrap with `%w`. Check with `errors.Is` / `errors.As`. Never compare strings.
- **`context.Context` is the first arg** of any function that does I/O or might block.
- **Accept interfaces, return structs.** Define interfaces at the consumer, not the producer.
- **No naked returns** in any function longer than 5 lines.
- **Channels are owned by writers.** Only the writer closes a channel.
- **`defer` for cleanup** at the top of the block right after acquisition.
- **Zero values should be useful** — design types so `var x T` is meaningful.
- **No package-level mutable state** — pass dependencies through constructors.
- **`sync.Mutex` by value, not pointer** in struct fields (and never copy the struct after first use).
- **Constructor: `NewThing` returns `*Thing` or `Thing`**, the rest of the API matches.

## 4. Project layout

Small binary / library:
```
mymod/
├── go.mod
├── go.sum
├── main.go        # if binary at root
├── internal/      # not importable externally
└── pkg/           # importable — use sparingly
```

App with multiple binaries (standard layout):
```
myapp/
├── go.mod
├── cmd/
│   ├── api/main.go
│   └── worker/main.go
├── internal/
│   ├── billing/
│   ├── users/
│   └── platform/
└── api/openapi.yaml
```

- `internal/` is a hard import boundary — use it liberally.
- Don't create `pkg/` unless this is an exported library.

## 5. Testing standards

```go
func TestInvoiceGenerator_TotalsUsage(t *testing.T) {
    t.Parallel()

    cases := []struct {
        name   string
        events []Event
        want   int64
    }{
        {"empty", nil, 0},
        {"single", []Event{{Cents: 100}}, 100},
        {"multi", []Event{{Cents: 100}, {Cents: 250}}, 350},
    }

    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()

            got := NewInvoiceGenerator(tc.events).Total()
            if got != tc.want {
                t.Errorf("Total() = %d, want %d", got, tc.want)
            }
        })
    }
}
```

- **Table-driven** for any case-based logic.
- `t.Parallel()` on every test that doesn't share global state. Combine with `t.Run` for parallelism.
- `t.Helper()` in helper funcs so failures point at the caller.
- `t.Cleanup(fn)` over `defer` in setup helpers.
- Use the standard library (`testing`, `errors.Is/As`, `cmp.Diff` from `github.com/google/go-cmp`) before reaching for testify.
- `httptest.NewServer` for HTTP tests. `t.TempDir()` for filesystem.
- Avoid `time.Sleep`. Use channels, `t.Eventually` patterns, or a clock interface.
- Race detector is non-negotiable: `go test -race`.

## 6. Concurrency hygiene

- Goroutines must have a defined lifetime — pass a `ctx`, return when it's done.
- No starting a goroutine without knowing how it terminates.
- `errgroup.Group` for fan-out with error propagation.
- `sync.WaitGroup.Add` before the `go` statement, not inside it.
- Guarded fields documented: `// guarded by mu`.

## 7. Pre-merge gate (run all)

```bash
go mod tidy && git diff --exit-code go.mod go.sum   # tidy must be a no-op
gofmt -s -l . | tee /dev/stderr | (! read)          # no diffs
golangci-lint run ./...
go vet ./...
go test -race -shuffle=on -count=1 ./...
govulncheck ./...
```

All exit 0. CI should fail on any.

## 8. Things to never silently introduce

- `//nolint` without `//nolint:rule // reason`.
- Replacing `errors.Is` checks with string matching.
- New direct deps in `go.mod` — call them out to the user.
- `init()` for anything beyond registering a driver. Prefer explicit constructors.
- `panic` outside of `main()` / truly unrecoverable invariants.
- Global variables that aren't `const` or sentinel errors.
- `interface{}` / `any` in exported APIs (use generics or concrete types).
