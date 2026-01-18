---
name: security-review
description: "Comprehensive security code review for identifying vulnerabilities in application code. Use when: reviewing code for security issues, performing security audits, analyzing pull requests for security implications, threat modeling features, or identifying OWASP Top 10 vulnerabilities. Covers injection, authentication, authorization, cryptography, data exposure, and security misconfigurations."
allowed-tools: Read, Grep, Glob, Bash
---

# Security Code Review

## Overview

Perform structured security reviews following a severity-based approach. Focus on issues that could lead to real-world exploits, not theoretical concerns.

## Quick Reference

| Severity | Examples | Action |
|----------|----------|--------|
| Critical | RCE, SQL injection, auth bypass | Block deployment |
| High | XSS, IDOR, SSRF, path traversal | Require fix before merge |
| Medium | Information disclosure, weak crypto | Fix in next sprint |
| Low | Missing headers, verbose errors | Track for improvement |

## Review Workflow

### 1. Reconnaissance (5 min)

```bash
# Identify attack surface
grep -rn "params\|request\." --include="*.rb" --include="*.py" --include="*.js" .
grep -rn "exec\|eval\|system\|spawn" --include="*.rb" --include="*.py" --include="*.js" .
grep -rn "password\|secret\|key\|token" --include="*.rb" --include="*.py" --include="*.js" .
```

Map entry points: APIs, form handlers, file uploads, webhooks, background jobs.

### 2. Vulnerability Scan by Category

#### A. Injection (CRITICAL)

**SQL Injection**
```
# BAD: String interpolation in queries
User.where("name = '#{params[:name]}'")
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# GOOD: Parameterized queries
User.where(name: params[:name])
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

**Command Injection**
```
# BAD: Shell execution with user input
system("convert #{params[:file]} output.png")
os.system(f"grep {query} logfile.txt")

# GOOD: Array form or shellwords
system("convert", params[:file], "output.png")
subprocess.run(["grep", query, "logfile.txt"], shell=False)
```

**NoSQL Injection**
```
# BAD: Object injection in MongoDB
db.users.find({ username: req.body.username })  // can receive { "$gt": "" }

# GOOD: Type validation
const username = String(req.body.username)
```

#### B. Authentication & Session (HIGH-CRITICAL)

Check for:
- [ ] Password hashing uses bcrypt/argon2 (not MD5/SHA1)
- [ ] Session tokens are cryptographically random
- [ ] Session invalidation on logout/password change
- [ ] Rate limiting on login endpoints
- [ ] No credentials in logs or error messages
- [ ] Secure cookie flags: HttpOnly, Secure, SameSite

```
# Search for weak auth patterns
grep -rn "MD5\|SHA1\|base64" --include="*.rb" --include="*.py" .
grep -rn "session\[.*\] =" --include="*.rb" .
```

#### C. Authorization (HIGH)

**IDOR (Insecure Direct Object Reference)**
```
# BAD: No ownership check
@document = Document.find(params[:id])

# GOOD: Scoped to current user
@document = current_user.documents.find(params[:id])
```

**Privilege Escalation**
```
# BAD: Role check bypassable
if params[:admin] == "true"
  
# GOOD: Server-side role verification
if current_user.admin?
```

Check every endpoint for:
- [ ] Authentication required?
- [ ] Authorization scoped to user/tenant?
- [ ] Admin functions protected?
- [ ] API keys/tokens validated?

#### D. Data Exposure (MEDIUM-HIGH)

**Sensitive Data in Responses**
```
# BAD: Returning full user object
render json: @user

# GOOD: Explicit allowlist
render json: @user.slice(:id, :name, :email)
```

**Logging Sensitive Data**
```
# Search for PII in logs
grep -rn "logger\|log\.\|puts\|print" --include="*.rb" --include="*.py" . | grep -i "password\|ssn\|credit\|token"
```

#### E. Cryptography (MEDIUM-HIGH)

| Don't Use | Use Instead |
|-----------|-------------|
| MD5, SHA1 | SHA-256, SHA-3 |
| DES, 3DES | AES-256-GCM |
| ECB mode | GCM, CBC with HMAC |
| rand() | SecureRandom, secrets |
| Hardcoded keys | Environment variables, vault |

```
# Find weak crypto
grep -rn "Digest::MD5\|hashlib.md5\|DES\|ECB" --include="*.rb" --include="*.py" .
```

#### F. SSRF & Path Traversal (HIGH)

**SSRF**
```
# BAD: User-controlled URL
response = HTTParty.get(params[:url])

# GOOD: Allowlist domains
ALLOWED_HOSTS = ['api.example.com']
uri = URI.parse(params[:url])
raise "Invalid host" unless ALLOWED_HOSTS.include?(uri.host)
```

**Path Traversal**
```
# BAD: Direct file access
send_file "uploads/#{params[:filename]}"

# GOOD: Basename extraction + allowlist directory
filename = File.basename(params[:filename])
path = Rails.root.join('uploads', filename)
raise "Invalid path" unless path.to_s.start_with?(Rails.root.join('uploads').to_s)
```

### 3. Generate Report

Structure findings as:

```markdown
## [SEVERITY] Finding Title

**Location:** `path/to/file.rb:42`

**Description:** Brief explanation of the vulnerability

**Proof of Concept:**
\`\`\`
curl -X POST /api/users -d '{"id": "../../etc/passwd"}'
\`\`\`

**Impact:** What an attacker could achieve

**Remediation:** Specific fix with code example

**References:** CWE-XX, OWASP link
```

## Threat Modeling Template

When reviewing new features, document:

1. **Assets**: What data/functionality needs protection?
2. **Entry Points**: How do users/attackers interact?
3. **Trust Boundaries**: Where does privilege change?
4. **Threats**: STRIDE analysis
   - **S**poofing: Can identity be faked?
   - **T**ampering: Can data be modified?
   - **R**epudiation: Can actions be denied?
   - **I**nformation Disclosure: Can data leak?
   - **D**enial of Service: Can availability be impacted?
   - **E**levation of Privilege: Can access be escalated?

## Common Secure Coding Patterns

See `references/secure-patterns.md` for language-specific secure implementations.

## Integration with CI/CD

For automated checks, see `references/ci-integration.md` for GitHub Actions setup with:
- Static analysis (Semgrep, Brakeman, Bandit)
- Dependency scanning (Dependabot, Snyk)
- Secret detection (git-secrets, truffleHog)
