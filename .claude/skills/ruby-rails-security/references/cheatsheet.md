# Rails Security Quick Reference

## One-Liners to Find Vulnerabilities

```bash
# SQL Injection
grep -rn 'where.*#{' app/
grep -rn 'find_by_sql.*#{' app/
grep -rn 'order(params' app/

# XSS
grep -rn 'html_safe' app/views/
grep -rn 'raw ' app/views/
grep -rn 'raw(' app/views/

# Mass Assignment
grep -rn 'permit!' app/controllers/
grep -rn 'permit.*:admin' app/controllers/

# Command Injection
grep -rn 'system(' app/
grep -rn 'exec(' app/
grep -rn '`.*#{' app/
grep -rn 'IO.popen' app/

# Unsafe Redirects
grep -rn 'redirect_to.*params' app/controllers/

# IDOR (manual check needed)
grep -rn '\.find(params' app/controllers/

# Secrets
grep -rn 'password.*=' --include="*.rb" config/
grep -rn 'secret.*=' --include="*.rb" config/

# Unsafe Deserialization
grep -rn 'YAML.load[^_]' app/
grep -rn 'Marshal.load' app/

# Dynamic Method Calls
grep -rn '\.send(params' app/
grep -rn 'constantize' app/
```

## Safe vs Unsafe Patterns

### SQL

| Unsafe ❌ | Safe ✅ |
|----------|---------|
| `where("x = '#{val}'")`  | `where(x: val)` |
| `where("x = " + val)` | `where("x = ?", val)` |
| `order(params[:sort])` | `order(ALLOWED.include?(p) ? p : 'id')` |

### Output/XSS

| Unsafe ❌ | Safe ✅ |
|----------|---------|
| `<%= raw text %>` | `<%= text %>` |
| `<%= text.html_safe %>` | `<%= sanitize text %>` |
| `content_tag(:p, text.html_safe)` | `content_tag(:p, text)` |

### Files

| Unsafe ❌ | Safe ✅ |
|----------|---------|
| `File.read(params[:path])` | `File.read(sanitized_path)` |
| `send_file(params[:file])` | `send_file(safe_path(params[:file]))` |

### Commands

| Unsafe ❌ | Safe ✅ |
|----------|---------|
| `system("cmd #{input}")` | `system("cmd", input)` |
| `` `grep #{query}` `` | `system("grep", query)` |

## Config Checklist

```ruby
# config/environments/production.rb
config.force_ssl = true  # ✓
config.log_level = :info  # ✓ (not :debug)
config.consider_all_requests_local = false  # ✓

# config/initializers/session_store.rb
secure: Rails.env.production?  # ✓
httponly: true  # ✓
same_site: :lax  # ✓

# ApplicationController
protect_from_forgery with: :exception  # ✓
```

## Gem Security

```bash
# Add to Gemfile
group :development, :test do
  gem 'brakeman', require: false
  gem 'bundler-audit', require: false
end

# Run
brakeman -q
bundle audit check --update
```

## Headers to Set

```ruby
# config/initializers/security_headers.rb
Rails.application.config.action_dispatch.default_headers = {
  'X-Frame-Options' => 'SAMEORIGIN',
  'X-Content-Type-Options' => 'nosniff',
  'X-Permitted-Cross-Domain-Policies' => 'none',
  'Referrer-Policy' => 'strict-origin-when-cross-origin',
  'Permissions-Policy' => 'geolocation=(), microphone=(), camera=()'
}

# For HSTS (add via web server or rack-ssl)
# Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Strong Parameters Template

```ruby
# Base controller
class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
  
  private
  
  def require_login
    redirect_to login_path unless current_user
  end
end

# Resource controller
class PostsController < ApplicationController
  before_action :require_login
  before_action :set_post, only: [:show, :edit, :update, :destroy]
  
  private
  
  def set_post
    # Scoped to current user - prevents IDOR
    @post = current_user.posts.find(params[:id])
  end
  
  def post_params
    # Explicit allowlist
    params.require(:post).permit(:title, :body, :published)
  end
end
```

## Auth Checklist

- [ ] bcrypt with cost >= 12
- [ ] reset_session on login
- [ ] Rate limiting on auth endpoints
- [ ] Secure password reset flow
- [ ] Session timeout configured
- [ ] Remember me tokens are random
- [ ] Failed logins don't reveal user existence
