# CI/CD Security Integration

## GitHub Actions - Security Review Workflow

```yaml
name: Security Review

on:
  pull_request:
    branches: [main, develop]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Static Analysis - Ruby
      - name: Run Brakeman
        if: hashFiles('Gemfile') != ''
        run: |
          gem install brakeman
          brakeman -q -f json -o brakeman-report.json || true
          
      # Static Analysis - Python  
      - name: Run Bandit
        if: hashFiles('requirements.txt') != '' || hashFiles('pyproject.toml') != ''
        run: |
          pip install bandit
          bandit -r . -f json -o bandit-report.json || true
          
      # Universal - Semgrep
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/secrets
            p/owasp-top-ten
            
      # Dependency Scanning
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          security-checks: 'vuln,secret,config'
          format: 'table'
          
      # Secret Detection
      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # Upload SARIF results
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: results.sarif
```

## Claude Code Security Review Action

```yaml
name: Claude Security Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  claude-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          
      - name: Claude Code Security Review
        uses: anthropics/claude-code-security-review@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          model: claude-sonnet-4-5-20250929
          max_tokens: 8192
```

## Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']

  - repo: https://github.com/PyCQA/bandit
    rev: 1.7.5
    hooks:
      - id: bandit
        args: ['-c', 'pyproject.toml']

  - repo: https://github.com/returntocorp/semgrep
    rev: v1.45.0
    hooks:
      - id: semgrep
        args: ['--config', 'p/security-audit', '--error']
```

## Semgrep Rules for Custom Patterns

```yaml
# .semgrep/custom-rules.yml
rules:
  - id: no-raw-sql-interpolation
    patterns:
      - pattern-either:
          - pattern: $DB.execute(f"...")
          - pattern: $DB.execute("..." % ...)
          - pattern: $DB.execute("..." + ...)
    message: "Possible SQL injection - use parameterized queries"
    severity: ERROR
    languages: [python]

  - id: no-unsafe-deserialization
    patterns:
      - pattern-either:
          - pattern: pickle.loads(...)
          - pattern: yaml.load(..., Loader=yaml.Loader)
          - pattern: Marshal.load(...)
    message: "Unsafe deserialization can lead to RCE"
    severity: ERROR
    languages: [python, ruby]

  - id: require-auth-check
    patterns:
      - pattern: |
          def $METHOD(self, request, ...):
            ...
      - pattern-not: |
          def $METHOD(self, request, ...):
            ...
            $AUTH.check(...)
            ...
    message: "API endpoint may be missing authentication check"
    severity: WARNING
    languages: [python]
```

## Dependency Scanning Configuration

### Dependabot (GitHub)
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "bundler"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
      
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

### Snyk (Multi-ecosystem)
```yaml
# .snyk
version: v1.25.0
ignore:
  SNYK-JS-LODASH-1234567:
    - '*':
        reason: 'False positive - not using affected function'
        expires: 2025-06-01T00:00:00.000Z
```

## Security Dashboard Metrics

Track these metrics over time:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Critical vulns | 0 | Semgrep + Trivy count |
| High vulns open > 7 days | 0 | Jira/GitHub issues |
| Mean time to remediate | < 7 days | PR merge time |
| Dependency currency | > 90% | Renovate/Dependabot |
| Secret exposure incidents | 0 | Gitleaks alerts |
| Security review coverage | 100% PRs | GitHub Actions |
