---
name: ruby-quality
description: "Enforce Ruby/Rails code quality standards. Use when writing, editing, refactoring, or reviewing Ruby (.rb), ERB (.erb), Gemfile, or Rakefile code; when scaffolding a new Ruby/Rails/Sinatra project; or when the user mentions RuboCop, Brakeman, RSpec, bundle audit, Standard, or 'Ruby linting'. Codifies RuboCop + Brakeman + RSpec + bundle-audit + POODR conventions."
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# Ruby Quality Standards

Apply this skill whenever touching Ruby code. The aim is consistent, idiomatic, secure Ruby with the minimum diff against the project's existing style.

## 0. Detect, don't impose

Before adding anything, look at what the project already uses:

```bash
ls .rubocop.yml .standard.yml .rubocop_todo.yml Gemfile .ruby-version 2>/dev/null
grep -E "rubocop|standard|brakeman|rspec|minitest|bundler-audit" Gemfile Gemfile.lock 2>/dev/null
```

- Existing `.rubocop.yml` → respect it, don't overwrite.
- `.standard.yml` present → project uses **StandardRB** (a RuboCop preset with no config). Run `bundle exec standardrb --fix` instead of rubocop.
- `Gemfile.lock` has `minitest` and no `rspec` → use **Minitest**, do not introduce RSpec.
- No `.ruby-version` / `.tool-versions` → ask which Ruby version, but default to the latest stable (3.3+) if scaffolding fresh.

## 1. Required toolchain (canonical)

| Concern        | Tool                              | Invocation                                   |
| -------------- | --------------------------------- | -------------------------------------------- |
| Lint + style   | RuboCop (or StandardRB)           | `bundle exec rubocop -A` / `standardrb --fix` |
| Security       | Brakeman (Rails) + bundler-audit  | `bundle exec brakeman -q` / `bundle exec bundle-audit check --update` |
| Types (opt-in) | RBS + Steep, or Sorbet            | `bundle exec steep check` / `bundle exec srb tc` |
| Tests          | RSpec (preferred) or Minitest     | `bundle exec rspec` / `bundle exec rake test` |
| Coverage       | SimpleCov                         | auto-loaded in `spec_helper.rb`               |
| Vulnerable deps| bundler-audit (CI), Dependabot    | `bundle exec bundle-audit check --update`     |

Add to Gemfile `:development, :test` group when missing:

```ruby
group :development, :test do
  gem "rubocop", require: false
  gem "rubocop-rails", require: false       # if Rails
  gem "rubocop-rspec", require: false       # if RSpec
  gem "rubocop-performance", require: false
  gem "rubocop-thread_safety", require: false
  gem "brakeman", require: false            # if Rails
  gem "bundler-audit", require: false
  gem "rspec", "~> 3.13"
  gem "simplecov", require: false
end
```

## 2. Default RuboCop config

If the project lacks `.rubocop.yml`, drop in this baseline (only when the user is starting fresh — never overwrite an existing one):

```yaml
# .rubocop.yml
require:
  - rubocop-performance
  - rubocop-thread_safety
  # Uncomment as applicable:
  # - rubocop-rails
  # - rubocop-rspec

AllCops:
  TargetRubyVersion: 3.3
  NewCops: enable
  SuggestExtensions: false
  Exclude:
    - "bin/**/*"
    - "db/schema.rb"
    - "db/migrate/*_initial_schema.rb"
    - "node_modules/**/*"
    - "tmp/**/*"
    - "vendor/**/*"

Style/Documentation:
  Enabled: false                 # not every class needs YARD

Style/StringLiterals:
  EnforcedStyle: double_quotes   # consistent with interpolation

Style/FrozenStringLiteralComment:
  Enabled: true
  EnforcedStyle: always

Layout/LineLength:
  Max: 120                       # 80 is dogma; 120 is the modern compromise

Metrics/MethodLength:
  Max: 15
Metrics/ClassLength:
  Max: 200
Metrics/AbcSize:
  Max: 20

Naming/PredicateName:
  Enabled: true
Naming/AccessorMethodName:
  Enabled: true
```

## 3. POODR / Sandi Metz rules

The user follows POODR. Reinforce in reviews and new code:

- **SRP** — one reason to change per class/method.
- **Dependency injection** — pass collaborators in, do not instantiate inside.
- **Tell, don't ask** — `widget.repaint` not `if widget.dirty? then widget.repaint`.
- **Duck typing** — depend on messages, not classes (`respond_to?` over `is_a?`).
- **Sandi's rules (cap, not law)**: methods ≤ 5 lines, classes ≤ 100 lines, ≤ 4 method params, controllers instantiate ≤ 1 object per view.

## 4. Idioms to keep and to reject

```ruby
# REJECT — mutates input, hides side effect
def add_default!(opts)
  opts[:foo] ||= :bar
end

# ACCEPT — pure, returns new hash
def with_default(opts)
  { foo: :bar, **opts }
end

# REJECT — `rescue =>` swallows StandardError implicitly, no rescue narrowing
begin
  do_thing
rescue => e
  log(e)
end

# ACCEPT — narrow the rescue
begin
  do_thing
rescue Net::ReadTimeout, Timeout::Error => e
  log(e)
end

# REJECT — `unless ... else`
unless x then a else b end

# ACCEPT — `if`
if x then b else a end
```

- Prefer `Hash#fetch` over `Hash#[]` for required keys.
- Use `Object#then`/`yield_self` for fluent transformations.
- `frozen_string_literal: true` at the top of every file.
- Use keyword args for ≥ 3 parameters or any boolean flag.

## 5. Rails-specific (only if `bin/rails` exists)

Defer to `ruby-rails-security` skill for security depth. Quality essentials:

- `before_action` lists at the top of the controller, in load order.
- Strong params method per controller — `permit(:a, :b)`, never `permit!`.
- Scopes over class methods for ActiveRecord query objects.
- `has_many :records, dependent: :restrict_with_error` (force the caller to think).
- N+1: load eager with `.includes` or use `bullet` gem in dev/test.
- No business logic in views or controllers — push into POROs in `app/services/` or `app/models/concerns/`.

## 6. Testing standards (RSpec)

```ruby
# Good RSpec
RSpec.describe Billing::InvoiceGenerator, type: :service do
  subject(:invoice) { described_class.new(account:, period:).call }

  let(:account) { create(:account, plan: :pro) }
  let(:period)  { Date.new(2026, 1, 1)..Date.new(2026, 1, 31) }

  it "totals usage line items in cents" do
    create(:usage_event, account:, occurred_at: period.first, cents: 100)
    create(:usage_event, account:, occurred_at: period.last,  cents: 250)

    expect(invoice.total_cents).to eq(350)
  end
end
```

- One assertion per `it` (or `aggregate_failures`).
- `let` over `before` for setup.
- `subject(:name)` so tests read top-down.
- Avoid `allow_any_instance_of`; refactor to inject the collaborator instead.
- Use `instance_double` / `class_double`, never bare `double`.
- Factories (FactoryBot) over fixtures; build_stubbed > build > create.

## 7. Pre-merge gate (run all four)

```bash
bundle exec rubocop -A                # lint + autocorrect
bundle exec brakeman -q --no-pager    # security (Rails only)
bundle exec bundle-audit check --update
bundle exec rspec                      # tests
```

All four must exit 0. If RuboCop reports anything `-A` can't fix, surface those to the user before claiming done.

## 8. CI / pre-commit (if introducing)

Recommend [`lefthook`](https://github.com/evilmartians/lefthook) or `pre-commit`:

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    rubocop:
      glob: "*.{rb,rake,ru}"
      run: bundle exec rubocop --force-exclusion {staged_files}
    brakeman:
      glob: "app/**/*.rb"
      run: bundle exec brakeman -q --no-pager --no-progress -A
```

## 9. Things to never silently introduce

- `Gemfile` changes without telling the user.
- Disabling RuboCop cops globally — disable per-file with a comment + rationale.
- `# rubocop:disable all` — narrow to specific cops with a 1-line reason.
- Monkey-patching stdlib or gems.
- `binding.pry` / `byebug` / `puts` left in code.
