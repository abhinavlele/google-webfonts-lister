---
name: python-quality
description: "Enforce Python code quality standards. Use when writing, editing, refactoring, or reviewing Python (.py, .pyi) code, Jupyter notebooks, pyproject.toml, requirements.txt, or Poetry/uv configs; or when the user mentions ruff, black, mypy, pytest, bandit, pip-audit, or 'Python linting'. Codifies ruff + mypy + pytest + bandit + pip-audit conventions."
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# Python Quality Standards

Apply this skill whenever touching Python code. The goal is consistent, type-safe, secure Python that uses modern tooling (ruff replaces flake8/isort/pyupgrade/autoflake/etc.).

## 0. Detect, don't impose

```bash
ls pyproject.toml setup.cfg setup.py requirements*.txt .python-version uv.lock poetry.lock 2>/dev/null
grep -E "ruff|black|mypy|pyright|pytest|bandit|pip-audit|flake8|isort" pyproject.toml requirements*.txt 2>/dev/null
python --version 2>/dev/null || python3 --version 2>/dev/null
```

- `pyproject.toml` already configures ruff/black/mypy → respect existing settings, only suggest tightening.
- `setup.cfg` + `flake8` + `isort` legacy → propose ruff migration but do not force it.
- `uv.lock` → use `uv` (`uv run pytest`, `uv add ...`). `poetry.lock` → use `poetry`. Plain `requirements.txt` → use `pip` + `venv`.
- No `.python-version` and scaffolding fresh → default to **Python 3.12** (3.11 minimum supported).

## 1. Required toolchain (canonical)

| Concern         | Tool          | Invocation                                  |
| --------------- | ------------- | ------------------------------------------- |
| Lint            | ruff          | `ruff check --fix .`                        |
| Format          | ruff format (or black) | `ruff format .`                    |
| Types           | mypy (strict) or pyright | `mypy .` / `pyright`             |
| Tests           | pytest        | `pytest -q`                                 |
| Coverage        | coverage.py / pytest-cov | `pytest --cov --cov-report=term-missing` |
| Security (SAST) | bandit        | `bandit -r src/ -ll`                        |
| Vulnerable deps | pip-audit     | `pip-audit` or `uv pip audit`               |
| Pre-commit      | pre-commit    | `pre-commit run --all-files`                |

Install (`uv` example):

```bash
uv add --dev ruff mypy pytest pytest-cov bandit pip-audit pre-commit
```

## 2. Default `pyproject.toml` config

Only drop in when the project has no quality config. Otherwise extend.

```toml
[project]
name = "myapp"
requires-python = ">=3.12"

[tool.ruff]
line-length = 100
target-version = "py312"
src = ["src", "tests"]
extend-exclude = [".venv", "build", "dist", "migrations"]

[tool.ruff.lint]
select = [
  "E", "W",      # pycodestyle
  "F",           # pyflakes
  "I",           # isort
  "B",           # flake8-bugbear
  "C4",          # flake8-comprehensions
  "UP",          # pyupgrade
  "SIM",         # flake8-simplify
  "RUF",         # ruff-specific
  "ASYNC",       # flake8-async
  "S",           # flake8-bandit (basic; bandit is run separately for depth)
  "PL",          # pylint subset
  "TID",         # tidy imports
  "ANN",         # missing annotations (relaxed in tests)
  "D",           # pydocstyle (Google convention)
  "N",           # PEP8 naming
]
ignore = [
  "D203",       # 1-blank-line-before-class (conflicts with D211)
  "D213",       # multi-line summary-second-line (conflicts with D212)
  "ANN101",     # missing-type-self
  "ANN102",     # missing-type-cls
  "PLR0913",    # too many arguments — judgement call
]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101", "D", "ANN", "PLR2004"]  # asserts, docstrings, magic nums OK in tests
"**/__init__.py" = ["D104", "F401"]

[tool.ruff.lint.pydocstyle]
convention = "google"

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true

[tool.mypy]
python_version = "3.12"
strict = true
warn_unused_configs = true
warn_redundant_casts = true
warn_unused_ignores = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
no_implicit_optional = true
plugins = []                       # add "pydantic.mypy" etc. as needed

[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false

[tool.pytest.ini_options]
minversion = "8.0"
testpaths = ["tests"]
addopts = [
  "-ra",
  "--strict-markers",
  "--strict-config",
  "--showlocals",
]
filterwarnings = ["error"]
xfail_strict = true

[tool.coverage.run]
branch = true
source = ["src"]
omit = ["tests/*", "**/__main__.py"]

[tool.coverage.report]
show_missing = true
skip_covered = true
fail_under = 80
```

## 3. Idioms to keep and to reject

```python
# REJECT — mutable default
def add(item, items=[]):
    items.append(item)
    return items

# ACCEPT — sentinel
def add(item, items: list[str] | None = None) -> list[str]:
    items = list(items or [])
    items.append(item)
    return items

# REJECT — bare except, swallows KeyboardInterrupt
try:
    do_thing()
except:
    log("oops")

# ACCEPT — narrow
try:
    do_thing()
except (TimeoutError, ConnectionError) as exc:
    log("network", exc_info=exc)
    raise

# REJECT — string concatenation in SQL / shell
cursor.execute("SELECT * FROM u WHERE id = " + uid)
os.system(f"convert {filename} out.png")

# ACCEPT — parameterized / subprocess list form
cursor.execute("SELECT * FROM u WHERE id = %s", (uid,))
subprocess.run(["convert", filename, "out.png"], check=True)
```

- **Type every public function signature** (`def f(x: int) -> str:`). Local variables can usually infer.
- Use `pathlib.Path`, never `os.path` joins.
- Use `dataclasses` or `pydantic` for structured data, never bare dicts crossing module boundaries.
- Prefer `enum.StrEnum`/`IntEnum` over magic constants.
- f-strings over `%` and `.format()`.
- `match` statements for structural matching (3.10+).
- `with` context managers for any acquired resource — file, lock, db conn, mock.

## 4. Project layout (src/ layout)

```
myapp/
├── pyproject.toml
├── src/
│   └── myapp/
│       ├── __init__.py
│       ├── __main__.py
│       └── ...
├── tests/
│   ├── conftest.py
│   └── test_*.py
└── .pre-commit-config.yaml
```

`src/` layout prevents accidentally testing against the source tree instead of the installed package. Always use it for new libraries.

## 5. Testing standards (pytest)

```python
# tests/test_invoice.py
import pytest
from datetime import date
from myapp.billing import InvoiceGenerator

@pytest.fixture
def account(db):
    return db.create_account(plan="pro")

class TestInvoiceGenerator:
    def test_totals_usage_in_cents(self, account, db):
        db.create_event(account=account, occurred_at=date(2026, 1, 1), cents=100)
        db.create_event(account=account, occurred_at=date(2026, 1, 31), cents=250)

        invoice = InvoiceGenerator(account=account, period=date(2026, 1, 1)).call()

        assert invoice.total_cents == 350

    @pytest.mark.parametrize("plan,expected", [("free", 0), ("pro", 100), ("ent", 50)])
    def test_discount_by_plan(self, plan: str, expected: int) -> None:
        assert discount_cents(plan, base=100) == expected
```

- Fixtures over setUp/tearDown.
- Parametrize over duplicated test bodies.
- One concept per test; multiple `assert`s are fine if they probe the same invariant.
- Mock at the boundary (HTTP, filesystem, time, randomness) — never internal collaborators. Use `pytest-httpx` / `respx` for HTTP, `freezegun` for time.
- Avoid `unittest.mock.patch` paths longer than 2 segments — sign of bad seams.

## 6. Pre-merge gate (run all four)

```bash
ruff check .
ruff format --check .
mypy .
pytest --cov
bandit -r src/ -ll -q
pip-audit            # or: uv pip audit
```

All must exit 0. `ruff check --fix` and `ruff format` are safe to run first.

## 7. Pre-commit recommendation

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.11.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests]
  - repo: https://github.com/PyCQA/bandit
    rev: 1.7.10
    hooks:
      - id: bandit
        args: ["-c", "pyproject.toml"]
        additional_dependencies: ["bandit[toml]"]
```

## 8. Things to never silently introduce

- `# type: ignore` without a specific error code and a rationale comment.
- Disabling ruff rules globally — narrow with `# noqa: RULE` and a reason.
- `print` for logging — use `logging` module, configure at app entry.
- `requests` without a timeout. Always `requests.get(..., timeout=10)` or use `httpx`.
- New top-level dependencies without telling the user. Group with `--dev` / `[project.optional-dependencies]`.
- `eval`, `exec`, `pickle.loads` on untrusted data, `yaml.load` (use `yaml.safe_load`).
