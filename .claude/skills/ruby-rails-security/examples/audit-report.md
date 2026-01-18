# Security Audit Report: [Application Name]

## Executive Summary

**Application:** [Name]
**Version/Commit:** [Version or Git SHA]
**Audit Date:** [Date]
**Auditor:** [Name]

### Overall Risk Assessment

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | ✅ |
| High | 0 | ⚠️ |
| Medium | 0 | 🔶 |
| Low | 0 | ℹ️ |

### Key Findings Summary

1. [Most critical finding - one sentence]
2. [Second most critical finding]
3. [Third most critical finding]

### Immediate Actions Required

- [ ] [Critical action 1]
- [ ] [Critical action 2]

---

## Scope

### In Scope
- Application code (app/, lib/)
- Configuration files (config/)
- Gem dependencies (Gemfile)
- Database queries and models
- Authentication and authorization
- API endpoints

### Out of Scope
- Infrastructure security
- Third-party integrations
- Mobile applications
- Penetration testing

### Methodology
- Static analysis with Brakeman
- Manual code review
- Dependency scanning with bundle-audit
- Configuration review

---

## Findings

### Critical Severity

#### [CRIT-001] [Finding Title]

**Location:** `app/controllers/users_controller.rb:42`

**Description:**
[Detailed description of the vulnerability]

**Vulnerable Code:**
```ruby
# Vulnerable pattern
User.where("email = '#{params[:email]}'")
```

**Impact:**
An attacker could execute arbitrary SQL queries, potentially accessing, modifying, or deleting all database records.

**Proof of Concept:**
```bash
curl -X POST https://app.com/api/users \
  -d "email=' OR '1'='1"
```

**Remediation:**
```ruby
# Fixed pattern
User.where(email: params[:email])
```

**References:**
- CWE-89: SQL Injection
- OWASP: https://owasp.org/www-community/attacks/SQL_Injection

---

### High Severity

#### [HIGH-001] [Finding Title]

**Location:** `app/views/users/show.html.erb:15`

**Description:**
[Description]

**Vulnerable Code:**
```erb
<%= raw @user.bio %>
```

**Impact:**
[Impact description]

**Remediation:**
```erb
<%= sanitize @user.bio, tags: %w[b i u p] %>
```

**References:**
- CWE-79: Cross-site Scripting

---

### Medium Severity

#### [MED-001] [Finding Title]

**Location:** [File:Line]

**Description:**
[Description]

**Impact:**
[Impact]

**Remediation:**
[Fix]

---

### Low Severity

#### [LOW-001] [Finding Title]

**Location:** [File:Line]

**Description:**
[Description]

**Impact:**
[Impact]

**Remediation:**
[Fix]

---

## Configuration Review

### Authentication Configuration

| Check | Status | Notes |
|-------|--------|-------|
| Password hashing (bcrypt) | ✅ | Cost factor: 12 |
| Session security flags | ⚠️ | Missing SameSite |
| CSRF protection | ✅ | protect_from_forgery enabled |
| Rate limiting on login | ❌ | Not implemented |

### Security Headers

| Header | Expected | Actual | Status |
|--------|----------|--------|--------|
| Strict-Transport-Security | max-age=31536000 | Not set | ❌ |
| X-Content-Type-Options | nosniff | nosniff | ✅ |
| X-Frame-Options | SAMEORIGIN | SAMEORIGIN | ✅ |
| Content-Security-Policy | default-src 'self' | Not set | ⚠️ |

### Environment Configuration

| Setting | Production Value | Status |
|---------|-----------------|--------|
| force_ssl | true | ✅ |
| log_level | :info | ✅ |
| consider_all_requests_local | false | ✅ |
| debug_exception_response_format | :api | ✅ |

---

## Dependency Analysis

### Vulnerable Gems

| Gem | Current | Patched | Severity | CVE |
|-----|---------|---------|----------|-----|
| [gem_name] | 1.0.0 | 1.0.1 | High | CVE-2024-XXXX |

### Outdated Dependencies

| Gem | Current | Latest | Risk |
|-----|---------|--------|------|
| rails | 7.0.0 | 7.1.0 | Medium |

---

## Recommendations

### Immediate (Within 1 Week)
1. [Critical fix 1]
2. [Critical fix 2]

### Short-Term (Within 1 Month)
1. [High priority fix]
2. [Security enhancement]

### Long-Term (Within Quarter)
1. [Security improvement]
2. [Process improvement]

### Process Improvements
- [ ] Implement security-focused code review checklist
- [ ] Add Brakeman to CI pipeline
- [ ] Schedule quarterly dependency audits
- [ ] Implement security headers via middleware

---

## Appendix

### A. Tools Used

| Tool | Version | Purpose |
|------|---------|---------|
| Brakeman | 6.0.0 | Static analysis |
| bundle-audit | 0.9.1 | Dependency scanning |
| curl | 8.0.0 | Manual testing |

### B. Brakeman Output

```json
{
  "scan_info": {...},
  "warnings": [...]
}
```

### C. Files Reviewed

- app/controllers/*.rb
- app/models/*.rb
- app/views/**/*.erb
- config/*.rb
- config/initializers/*.rb

---

**Report Prepared By:** [Name]
**Date:** [Date]
**Confidentiality:** Internal Use Only
