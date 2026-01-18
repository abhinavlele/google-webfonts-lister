---
name: ruby-rails-security
description: "Specialized security auditing for Ruby and Rails applications. Use when: reviewing Rails code for vulnerabilities, analyzing Gemfile dependencies, checking Rails security configurations, auditing ActiveRecord queries, reviewing authentication/authorization implementations, or preparing security assessments for Rails deployments. Covers Rails-specific vulnerabilities, Brakeman integration, and secure Rails patterns."
allowed-tools: Read, Grep, Glob, Bash
---

# Ruby on Rails Security Audit

## Overview

Rails provides strong security defaults, but misconfigurations and unsafe patterns create vulnerabilities. Focus on areas where developers override defaults or handle user input.

## Quick Audit Commands

```bash
# Run Brakeman (primary Rails security scanner)
gem install brakeman
brakeman -q --no-pager -f json -o brakeman.json

# Find dangerous patterns
grep -rn "raw\|html_safe\|sanitize" app/views/
grep -rn "where.*#{\|find_by_sql" app/models/
grep -rn "send\|constantize\|eval" app/
grep -rn "redirect_to.*params" app/controllers/

# Check dependency vulnerabilities
bundle audit check --update
```

## Rails-Specific Vulnerability Checklist

### 1. SQL Injection (HIGH)

**Vulnerable Patterns:**
```ruby
# BAD: String interpolation
User.where("name = '#{params[:name]}'")
User.where("status = " + params[:status])
User.find_by_sql("SELECT * FROM users WHERE id = #{params[:id]}")

# BAD: Array form with interpolation
User.where(["name LIKE '%#{params[:q]}%'"])

# GOOD: Parameterized queries
User.where(name: params[:name])
User.where("name = ?", params[:name])
User.where("name LIKE ?", "%#{User.sanitize_sql_like(params[:q])}%")
```

**Search Pattern:**
```bash
grep -rn "where.*#{\|where.*+\|find_by_sql.*#{\|order.*params\|select.*params" app/
```

**ORDER BY Injection:**
```ruby
# BAD: Direct parameter in order
User.order(params[:sort])
User.order("#{params[:column]} #{params[:direction]}")

# GOOD: Allowlist columns
ALLOWED_SORT = %w[name created_at email].freeze
def safe_order(column, direction)
  return 'created_at DESC' unless ALLOWED_SORT.include?(column)
  direction = direction == 'asc' ? 'ASC' : 'DESC'
  "#{column} #{direction}"
end
```

### 2. Cross-Site Scripting (XSS) (HIGH)

**Vulnerable Patterns:**
```ruby
# BAD: Bypassing Rails escaping
<%= raw user.bio %>
<%= user.bio.html_safe %>
<%= content_tag(:div, user.content.html_safe) %>

# BAD: Unescaped in JavaScript
<script>var data = '<%= @user.name %>';</script>

# GOOD: Let Rails escape (default)
<%= user.bio %>

# GOOD: Sanitize if HTML needed
<%= sanitize(user.bio, tags: %w[b i u p br], attributes: %w[href]) %>

# GOOD: JSON in script tags
<script>var data = <%= @user.to_json.html_safe %>;</script>
```

**Search Pattern:**
```bash
grep -rn "\.html_safe\|raw \|raw(" app/views/
grep -rn "content_tag.*html_safe" app/
```

### 3. Mass Assignment (MEDIUM)

**Vulnerable Patterns:**
```ruby
# BAD: permit! allows everything
def user_params
  params.require(:user).permit!
end

# BAD: Permitting admin flag
params.require(:user).permit(:name, :email, :admin, :role)

# BAD: Dynamic permit
params.require(:user).permit(params[:user].keys)

# GOOD: Explicit allowlist
def user_params
  params.require(:user).permit(:name, :email, :bio)
end

# GOOD: Separate params for admin actions
def admin_user_params
  params.require(:user).permit(:name, :email, :role, :admin)
end
```

**Search Pattern:**
```bash
grep -rn "permit!" app/controllers/
grep -rn "permit.*:admin\|permit.*:role\|permit.*:is_admin" app/controllers/
```

### 4. Authentication & Session (CRITICAL)

**Session Fixation:**
```ruby
# GOOD: Reset session on login (Rails default, but verify)
class SessionsController < ApplicationController
  def create
    user = User.authenticate(params[:email], params[:password])
    if user
      reset_session  # Prevent session fixation
      session[:user_id] = user.id
      redirect_to dashboard_path
    end
  end
end
```

**Timing-Safe Comparison:**
```ruby
# BAD: Regular comparison (timing attack)
if user.api_token == params[:token]

# GOOD: Constant-time comparison
if ActiveSupport::SecurityUtils.secure_compare(user.api_token, params[:token])
```

**Password Storage:**
```ruby
# Verify using bcrypt with sufficient cost
# Check Gemfile for bcrypt gem
# Check User model for has_secure_password

# Good bcrypt cost (Rails 7 default is 12)
BCrypt::Engine.cost  # Should be >= 12
```

### 5. Authorization (IDOR) (HIGH)

**Vulnerable Patterns:**
```ruby
# BAD: No scoping to current user
def show
  @document = Document.find(params[:id])
end

def update
  @account = Account.find(params[:id])
  @account.update(account_params)
end

# GOOD: Scope to current user
def show
  @document = current_user.documents.find(params[:id])
end

# GOOD: Use authorization library
def update
  @account = Account.find(params[:id])
  authorize @account  # Pundit
  @account.update(account_params)
end
```

**Search Pattern:**
```bash
grep -rn "\.find(params\|\.find_by.*params\[:id\]" app/controllers/ | grep -v current_user
```

### 6. Unsafe Redirects (MEDIUM)

**Vulnerable Patterns:**
```ruby
# BAD: Open redirect
redirect_to params[:return_to]
redirect_to request.referer

# GOOD: Validate redirect URL
def safe_redirect(url)
  uri = URI.parse(url)
  if uri.host.nil? || uri.host == request.host
    redirect_to url
  else
    redirect_to root_path
  end
rescue URI::InvalidURIError
  redirect_to root_path
end

# GOOD: Use path only
redirect_to URI.parse(params[:return_to]).path
```

### 7. File Upload (HIGH)

**Vulnerable Patterns:**
```ruby
# BAD: No content type validation
def upload
  File.write("uploads/#{params[:file].original_filename}", params[:file].read)
end

# BAD: Trust client content type
if params[:file].content_type == 'image/jpeg'

# GOOD: Validate with magic bytes
def valid_image?(file)
  allowed = ["\x89PNG", "\xFF\xD8\xFF", "GIF8"]  # PNG, JPEG, GIF
  magic = file.read(4)
  file.rewind
  allowed.any? { |sig| magic.start_with?(sig) }
end

# GOOD: Use Active Storage with validation
class User < ApplicationRecord
  has_one_attached :avatar
  
  validate :acceptable_avatar
  
  def acceptable_avatar
    return unless avatar.attached?
    
    unless avatar.blob.content_type.in?(%w[image/jpeg image/png image/gif])
      errors.add(:avatar, 'must be a JPEG, PNG, or GIF')
    end
    
    if avatar.blob.byte_size > 5.megabytes
      errors.add(:avatar, 'is too large (max 5MB)')
    end
  end
end
```

### 8. Dangerous Methods (CRITICAL)

**Command Injection:**
```ruby
# BAD: Shell execution with user input
system("convert #{params[:file]} output.png")
`grep #{params[:query]} logfile.txt`
exec("process #{params[:data]}")
IO.popen("cmd #{user_input}")

# GOOD: Array form (no shell interpretation)
system("convert", params[:file], "output.png")

# GOOD: Shellwords for complex cases
require 'shellwords'
system("grep #{Shellwords.escape(params[:query])} logfile.txt")
```

**Unsafe Deserialization:**
```ruby
# BAD: YAML.load with untrusted input
YAML.load(params[:data])
Marshal.load(params[:data])

# GOOD: Use safe_load
YAML.safe_load(params[:data], permitted_classes: [Symbol, Date])
JSON.parse(params[:data])
```

**Dynamic Method Calls:**
```ruby
# BAD: User controls method name
send(params[:action])
Object.const_get(params[:class])
params[:model].constantize

# GOOD: Allowlist
ALLOWED_ACTIONS = %w[view edit delete].freeze
if ALLOWED_ACTIONS.include?(params[:action])
  send(params[:action])
end
```

### 9. Configuration Security

**Check These Files:**

```ruby
# config/environments/production.rb
config.force_ssl = true                    # MUST be true
config.log_level = :info                   # Not :debug in production

# config/initializers/session_store.rb
Rails.application.config.session_store :cookie_store,
  key: '_myapp_session',
  secure: Rails.env.production?,           # HTTPS only in production
  httponly: true,                          # No JavaScript access
  same_site: :lax                          # CSRF protection

# config/application.rb or initializer
config.action_dispatch.default_headers = {
  'X-Frame-Options' => 'SAMEORIGIN',
  'X-XSS-Protection' => '0',               # Disable (deprecated, can cause issues)
  'X-Content-Type-Options' => 'nosniff',
  'X-Permitted-Cross-Domain-Policies' => 'none',
  'Referrer-Policy' => 'strict-origin-when-cross-origin'
}

# Verify CSRF protection
class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception    # Not :null_session for web apps
end
```

### 10. Secrets Management

```ruby
# BAD: Hardcoded secrets
API_KEY = "sk-1234567890abcdef"
config.secret_key = "hardcoded_secret"

# BAD: Secrets in version control
# Check for credentials.yml.enc key in repo

# GOOD: Environment variables
API_KEY = ENV.fetch('API_KEY')

# GOOD: Rails credentials (encrypted)
Rails.application.credentials.api_key

# Search for exposed secrets
grep -rn "password\s*=\|secret\s*=\|key\s*=\|token\s*=" --include="*.rb" . | grep -v "\.git"
```

## Brakeman Integration

### Running Brakeman

```bash
# Full scan
brakeman -A

# Focus on high/critical
brakeman -w2

# Ignore false positives (create brakeman.ignore)
brakeman -I

# CI-friendly output
brakeman -q -f junit -o brakeman-results.xml
```

### Common False Positives

```ruby
# Ignore file: config/brakeman.ignore
{
  "ignored_warnings": [
    {
      "fingerprint": "abc123...",
      "note": "False positive: params are validated by..."
    }
  ]
}
```

## Gem Security

```bash
# Check for vulnerable gems
bundle audit check --update

# Output vulnerable gems
bundle audit check --format json

# Continuous monitoring
# Add to CI: bundler-audit gem in Gemfile
```

**High-Risk Gems to Audit:**
- `devise` — Authentication (check configuration)
- `pundit` / `cancancan` — Authorization (check policies)
- `paperclip` / `carrierwave` — File uploads (check validations)
- `activeadmin` — Admin panel (check auth, authorization)
- `sidekiq` — Background jobs (check web UI auth)

## Security Headers Verification

```ruby
# Test with curl
curl -I https://yourapp.com

# Expected headers
# Strict-Transport-Security: max-age=31536000; includeSubDomains
# X-Content-Type-Options: nosniff
# X-Frame-Options: SAMEORIGIN
# Content-Security-Policy: default-src 'self'
```

## Audit Report Template

See `examples/audit-report.md` for Rails security audit report template.
