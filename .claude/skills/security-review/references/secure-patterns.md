# Secure Coding Patterns by Language

## Ruby / Rails

### Input Validation
```ruby
# Strong parameters
def user_params
  params.require(:user).permit(:name, :email)
end

# Type coercion
id = params[:id].to_i
raise ArgumentError if id <= 0
```

### SQL Safety
```ruby
# Parameterized queries
User.where("email = ?", params[:email])
User.where(email: params[:email])

# LIKE queries (escape wildcards)
User.where("name LIKE ?", "%#{User.sanitize_sql_like(params[:q])}%")
```

### XSS Prevention
```ruby
# Rails auto-escapes in ERB
<%= user.name %>  # Safe

# Mark trusted HTML explicitly
<%= sanitize(user.bio, tags: %w[b i u]) %>

# JSON in script tags
<script>
  var data = <%= raw @data.to_json.html_safe %>;
</script>
```

### CSRF Protection
```ruby
# Already enabled by default in Rails
class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
end

# Skip only for legitimate API endpoints with token auth
skip_before_action :verify_authenticity_token, only: [:api_endpoint]
```

### File Upload
```ruby
# Validate content type
ALLOWED_TYPES = %w[image/jpeg image/png image/gif]

def upload
  file = params[:file]
  raise "Invalid type" unless ALLOWED_TYPES.include?(file.content_type)
  
  # Generate random filename
  ext = File.extname(file.original_filename)
  filename = "#{SecureRandom.uuid}#{ext}"
  
  # Store outside web root
  path = Rails.root.join('storage', 'uploads', filename)
  FileUtils.mv(file.tempfile, path)
end
```

### Session Security
```ruby
# config/initializers/session_store.rb
Rails.application.config.session_store :cookie_store,
  key: '_myapp_session',
  secure: Rails.env.production?,
  httponly: true,
  same_site: :lax

# Regenerate session on login
reset_session
session[:user_id] = user.id
```

## Python / Django / Flask

### Input Validation
```python
# Django forms
from django import forms

class UserForm(forms.Form):
    email = forms.EmailField()
    age = forms.IntegerField(min_value=0, max_value=150)

# Pydantic (FastAPI)
from pydantic import BaseModel, EmailStr, conint

class User(BaseModel):
    email: EmailStr
    age: conint(ge=0, le=150)
```

### SQL Safety
```python
# Django ORM (always safe)
User.objects.filter(email=request.POST['email'])

# Raw SQL (parameterized)
cursor.execute("SELECT * FROM users WHERE email = %s", [email])

# SQLAlchemy
session.query(User).filter(User.email == email)
```

### Command Execution
```python
# NEVER use shell=True with user input
import subprocess

# Safe
subprocess.run(['grep', pattern, filename], check=True)

# For complex commands, use shlex
import shlex
args = shlex.split(f'grep {shlex.quote(pattern)} {shlex.quote(filename)}')
subprocess.run(args)
```

### Path Handling
```python
import os
from pathlib import Path

UPLOAD_DIR = Path('/var/uploads')

def get_file(filename):
    # Normalize and validate
    safe_name = Path(filename).name  # Strips directory components
    full_path = (UPLOAD_DIR / safe_name).resolve()
    
    # Ensure still in upload directory
    if not str(full_path).startswith(str(UPLOAD_DIR)):
        raise ValueError("Path traversal detected")
    
    return full_path
```

## JavaScript / Node.js

### XSS Prevention
```javascript
// React auto-escapes
<div>{userInput}</div>  // Safe

// Dangerous - only with trusted content
<div dangerouslySetInnerHTML={{__html: trustedHtml}} />

// DOM manipulation - use textContent
element.textContent = userInput;  // Safe
element.innerHTML = userInput;     // Dangerous

// URL handling
const url = new URL(userInput, window.location.origin);
if (url.origin !== window.location.origin) {
  throw new Error('Invalid URL');
}
```

### SQL Safety (Node.js)
```javascript
// Parameterized queries
const { rows } = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// Prisma (ORM - always safe)
const user = await prisma.user.findUnique({
  where: { email: userEmail }
});
```

### JWT Handling
```javascript
// Verify algorithm
const jwt = require('jsonwebtoken');

const options = {
  algorithms: ['HS256'],  // Explicit algorithm
  issuer: 'myapp',
  audience: 'myapp-users'
};

try {
  const decoded = jwt.verify(token, secret, options);
} catch (err) {
  // Handle invalid token
}
```

### Prototype Pollution Prevention
```javascript
// Freeze prototypes in sensitive code
Object.freeze(Object.prototype);

// Safe object creation
const obj = Object.create(null);

// Validate keys when merging
function safeMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    target[key] = source[key];
  }
  return target;
}
```

## API Security Checklist

- [ ] Rate limiting on all endpoints
- [ ] Input validation with strict schemas
- [ ] Output encoding appropriate to context
- [ ] Authentication on all non-public endpoints
- [ ] Authorization checks scoped to user/tenant
- [ ] HTTPS only (HSTS enabled)
- [ ] CORS configured with explicit origins
- [ ] Security headers (CSP, X-Frame-Options, etc.)
- [ ] Logging without sensitive data
- [ ] Error messages don't leak internals
