```markdown
# Claude Code Configuration

## CRITICAL RULES

1. **Orchestrator First**: For ANY non-trivial task, use the `orchestrator` agent
2. **Parallel Execution**: Independent tool calls MUST be in ONE message
3. **GitHub CLI**: Use `gh` for all GitHub operations
4. **No AI Attribution**: NEVER add AI attribution anywhere - no "Generated with Claude Code", no Co-Authored-By headers, no robot emojis, no "AI-assisted" labels in commits, PRs, issues, code comments, or any other output
5. **Prefer Established Libraries**: Use well-established, battle-tested libraries over custom implementations. Only write custom code when existing libraries don't fit the use case or introduce unacceptable trade-offs (security, performance, licensing, dependencies)
6. **Autonomous File Operations**: Sub-agents must write files directly using the Write tool without asking for permission. NEVER use `cat << EOF` or heredoc patterns - use the Write tool. NEVER ask "should I create this file?" - just create it
7. **No Permission Prompts**: When auto-accept edits is enabled, NEVER ask for permission or confirmation before executing. No "Should I proceed?", no "Type 'yes' to continue", no "Would you like me to...?" - just execute the task directly. The user enabled auto-accept specifically to avoid these interruptions
8. **POODR Principles**: Follow Sandi Metz's Practical Object-Oriented Design principles - single responsibility, dependency injection, duck typing (no `respond_to?`/`is_a?` checks), tell don't ask, small classes/methods
9. **Quality Gates**: All code changes must pass tests, linters, and security review
10. **PR-Only Changes**: NEVER push directly to main/master. All GitHub changes MUST go through a pull request. Create a feature branch, commit changes, push to remote, and open a PR using `gh pr create`
11. **Safe Deletions**: NEVER use `rm -rf` on directories without explicit user confirmation. Prefer targeted file deletions over recursive directory removal. When cleanup is needed, list contents first, then delete specific files
12. **No Heredocs for File Creation**: NEVER use `python3 << 'SCRIPT'` or any heredoc pattern to create files. Always use the Write tool directly. Heredocs in bash are error-prone and bypass proper file handling
13. **Deliberate Before Acting (DEFAULT BEHAVIOR)**: For ALL non-trivial tasks, ALWAYS perform deliberate analysis FIRST. This is the default - not optional. Use `<deliberation>` blocks with XML structure, or delegate to `deliberate-analyst` agent. Only skip for truly trivial single-line fixes
14. **XML for Complex Analysis**: When analyzing multi-step tasks, use XML tags to structure analysis - makes reasoning auditable and catches hidden assumptions
15. **Checkpoint Verification**: After each phase of multi-step work, explicitly verify against success criteria before proceeding. Never rush through phases.
16. **Surface Assumptions**: Explicitly state assumptions being made. For each assumption, ask "What if this is wrong?" - assumptions are where bugs hide
17. **Always Use Git Worktree**: NEVER use `git checkout` to switch branches. ALWAYS use git worktrees for any branch-related work. For new branches or switching to existing branches, create a worktree in a sibling directory (e.g., `../project-feature`). This prevents disrupting the user's working directory and enables true parallel development. Use `git-worktree-expert` agent for complex workflows.

## Deliberate Reasoning Protocol (DEFAULT - NOT OPTIONAL)

**Deliberate analysis is the DEFAULT behavior for ALL non-trivial tasks.** This is not something to "consider" - it's mandatory. The only exception is truly trivial single-line fixes.

For non-trivial tasks, engage in explicit structured thinking before implementation:

<deliberate_workflow>
### When to Use Deliberate Reasoning
- Ambiguous or incomplete requirements
- Architectural decisions with long-term implications
- Changes touching >5 files or multiple domains
- High-stakes changes (auth, payments, data migrations)
- When the "obvious" solution feels too easy
- Before major refactoring efforts

### The Protocol
```
1. UNDERSTAND → What is actually being asked? What am I assuming?
2. EXPLORE    → What exists? What patterns? What constraints?
3. OPTIONS    → What are the possible approaches? Tradeoffs?
4. RECOMMEND  → Which approach and why?
5. PLAN       → Steps with checkpoints and rollback plan
```

### Using XML for Structured Analysis
```xml
<task_analysis>
  <stated_goal>What the user literally asked</stated_goal>
  <actual_goal>What they're trying to achieve</actual_goal>
  <assumptions>
    <assumption risk="high">Assumption text - verify by...</assumption>
  </assumptions>
  <constraints>Technical, business, quality constraints</constraints>
</task_analysis>

<solution_options>
  <option name="minimal" effort="low" risk="medium">
    <description>Smallest change that works</description>
    <tradeoffs>What we gain/lose</tradeoffs>
  </option>
  <option name="comprehensive" effort="high" risk="low">
    <description>Full solution</description>
    <tradeoffs>What we gain/lose</tradeoffs>
  </option>
</solution_options>

<execution_plan>
  <phase name="setup">
    <steps>Ordered steps</steps>
    <checkpoint>What to verify before proceeding</checkpoint>
  </phase>
</execution_plan>
```

### Quick Command
Use `/deliberate [task description]` to invoke structured analysis before implementation.
</deliberate_workflow>

## Which Agent Should You Use?

**Simple answer: DELIBERATE FIRST, then orchestrator for implementation.**

```
┌─────────────────────────────────────────────────┐
│     DECISION TREE (DELIBERATE-FIRST DEFAULT)     │
└─────────────────────────────────────────────────┘
                      │
        Is task trivial? (single line, simple fix)
                      │
         ┌────────────┴────────────┐
         │                         │
        YES                       NO
         │                         │
    Do it directly          ┌─────────────────┐
                            │  DELIBERATE     │  ← MANDATORY FIRST STEP
                            │  (inline XML or │
                            │  deliberate-    │
                            │  analyst agent) │
                            └────────┬────────┘
                                     │
                              Analysis complete
                                     │
                                     ▼
                            ┌─────────────────┐
                            │  ORCHESTRATOR   │
                            │  (implements    │
                            │  using the      │
                            │  analysis plan) │
                            └────────┬────────┘
                                     │
                              Delegates to
                            specialized agents
                                     │
                            Tests, linters,
                            security review
                                     │
                                   Done
```

## Primary Workflow: Deliberate-First (MANDATORY)

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│              DELIBERATE ANALYSIS                     │
│  (MANDATORY for all non-trivial tasks)              │
│  - Use inline <deliberation> XML blocks, OR         │
│  - Delegate to deliberate-analyst agent             │
│  - Produce: problem analysis, options, plan         │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│                  ORCHESTRATOR                        │
│  - Receives deliberation output                     │
│  - Decomposes into sub-tasks per the plan           │
│  - Enforces software development practices          │
│  - Coordinates parallel agent execution             │
└─────────────────────────────────────────────────────┘
     │
     ├──────────┬──────────┬──────────┬──────────┐
     ▼          ▼          ▼          ▼          ▼
ruby-       backend-   security-   test-      other
developer   architect  engineer   writer-    agents
                                   fixer
```

### When to Use Orchestrator

**USE orchestrator** for:
- Multi-step implementations
- Features touching multiple files/domains
- Anything requiring tests + linting + security review
- Tasks with unclear scope needing decomposition
- Any task you'd use multiple agents for
- Infrastructure/Terraform changes (require security review)
- AWS/cloud operations (require security-engineer review)

**SKIP orchestrator** for:
- Single-line fixes (typos, obvious bugs)
- Simple file reads or searches
- Direct user questions about the codebase
- Tasks user explicitly wants done simply

## Software Development Standards (ENFORCED BY ORCHESTRATOR)

### Pre-Implementation
- [ ] Read and understand existing code
- [ ] Identify affected areas and tests

### Implementation
- [ ] Follow language-specific best practices
- [ ] Keep changes minimal and focused
- [ ] Don't over-engineer

### Post-Implementation (MANDATORY)
- [ ] Run linters (NEVER disable rules - fix the code)
- [ ] Run tests (NEVER skip - fix failures)
- [ ] Security review for sensitive changes

### Quality Gates
| Gate | Requirement | Status Required |
|------|-------------|-----------------|
| Linting | Zero violations | PASS |
| Tests | All pass | PASS |
| Security | No new vulnerabilities | PASS |

## Specialized Agents (Delegated by Orchestrator)

| Agent | Specialty | Use When |
|-------|-----------|----------|
| `deliberate-analyst` | Structured reasoning, assumption surfacing | **DEFAULT for ALL non-trivial tasks** - runs before any implementation |
| `ruby-developer` | Ruby/Rails code, RSpec, Rubocop | Ruby file changes |
| `backend-architect` | API design, system architecture | System design decisions |
| `security-engineer` | Security review, infrastructure security, vulnerability management | Auth, data handling, secrets, AWS/Terraform/IAM, cloud operations |
| `pentest-remediation-validator` | Validate security fix effectiveness | Post-security-fix verification |
| `test-writer-fixer` | Write tests, fix test failures | Test coverage gaps, failing tests |
| `git-worktree-expert` | Parallel branch work, worktree management | Multi-branch workflows |
| `ci-fixer-parallel` | Fix CI across multiple PRs | CI failures on multiple branches |
| `visual-storyteller` | Visual design, presentations | Documentation, diagrams |
| `trend-researcher` | Market trends, product research | Product decisions |
| `security-news-curator` | Security news research, Slack briefings | Weekly security updates (autonomous, unrestricted web access) |

### Agent Interaction Pattern

**Deliberate-First → Orchestrator Flow (MANDATORY):**

```
Task received
     │
     ▼
STEP 1: DELIBERATE (ALWAYS - not conditional)
     │
     ├─> Use inline <deliberation> XML blocks, OR
     ├─> Delegate to deliberate-analyst agent
     │
     └─> Produces:
         - Problem/goal analysis
         - Solution options with tradeoffs
         - Recommended approach with rationale
         - Execution plan with checkpoints
              │
              ▼
STEP 2: ORCHESTRATOR (implements the plan)
     │
     ├─> Decomposes tasks per deliberation output
     ├─> Delegates to specialized agents
     └─> Enforces quality gates
```

**When to use inline deliberation vs deliberate-analyst agent:**
- **Inline XML**: Quick analysis, straightforward tasks (2-5 min)
- **deliberate-analyst agent**: Complex analysis, architectural decisions, high-stakes (10+ min)

## AUTO-RUN Agents (Background)

| Agent | Trigger | Action |
|-------|---------|--------|
| `session-observer` | Session start/end | Track patterns in scratchpad |
| `test-writer-fixer` | Code changes | Proactively run tests |

### Session Observer
- **Scratchpad**: `~/src/abhinavlele/llm-scratchpad/<project>/`
- **Commits**: Directly to `main` (scratchpad repo only)

## User Info

### Atlassian
- Account ID: 712020:54c88bcc-581b-44d3-aa7b-7edfe8474318
- Email: abhinav.lele@li.me
- Name: Abhinav Lele

## Git Worktree Workflow

Use git worktrees for parallel development instead of branch switching:

**When to use worktrees:**
- Working on feature + urgent hotfix simultaneously
- Fixing CI across multiple PRs (via `ci-fixer-parallel`)
- Reviewing/testing multiple branches independently
- Long-running features needing main updates

**Quick reference:**
```bash
# Create worktree for existing branch
git worktree add ../project-feature feature-branch

# Create worktree with new branch
git worktree add -b hotfix ../project-hotfix main

# List and cleanup
git worktree list
git worktree remove ../project-feature
git worktree prune
```

**Delegate to:** `git-worktree-expert` for complex workflows, `ci-fixer-parallel` for multi-PR CI fixes.

## Bash Command Safety

**Safe patterns:**
```bash
# Redirect stderr safely
command 2>&1 | head -20

# Check before delete
ls -la target_dir/
rm specific_file.txt  # Not rm -rf

# Use timeout for long-running commands
timeout 30s ./long-running-script.sh

# Terraform validation
terraform init -backend=false && terraform validate
```

**Avoid:**
- `rm -rf` without explicit confirmation
- Unbounded output (always pipe to `head` or `tail`)
- Heredocs for file creation (use Write tool instead)
- `python3 << 'SCRIPT'` patterns (use Write tool + execute)
- Process termination (`pkill`, `kill -9`) without confirmation

**Pre-approved commands (no confirmation needed):**
- `cat` - Read file contents
- `echo` - Print text to stdout
- All commands listed in the tool permission system above

**Pre-approved WebFetch domains (no confirmation needed):**
- Security News: `*.com`, `*.net`, `*.org` (unrestricted for security-news-curator agent)
- Specifically approved: thehackernews.com, bleepingcomputer.com, krebsonsecurity.com, arstechnica.com, wired.com, theregister.com, darkreading.com, securityweek.com, techcrunch.com, medium.com, github.com, cisa.gov, ncsc.gov.uk

## Security-Sensitive Operations

Operations requiring extra review (delegate to `security-engineer`):

| Operation Type | Examples | Required Review |
|----------------|----------|-----------------|
| AWS/Cloud | `aws ec2`, `aws s3`, `aws iam` | security-engineer |
| Terraform | Any `.tf` changes | security-engineer |
| Auth/Secrets | Authentication, API keys, encryption | security-engineer |
| Deletions | `rm -rf`, recursive deletes | Explicit user confirmation |
| Process Control | `pkill`, `kill`, signal handling | User confirmation |
| Permission Changes | `chmod`, `chown` | Security review |

## Configuration Details

Detailed agent configurations in `agents/`:
- `orchestrator.md` - Main orchestrator (task decomposition, quality gates)
- `deliberate-analyst.md` - Structured reasoning before implementation
- `ruby-developer.md` - Ruby conventions, Rails patterns
- `backend-architect.md` - API design patterns
- `security-engineer.md` - Unified security (AppSec + InfraSec + vulnerability management)
- `pentest-remediation-validator.md` - Security fix validation
- `test-writer-fixer.md` - Testing patterns
- `git-worktree-expert.md` - Git worktree commands and workflows
- `ci-fixer-parallel.md` - Parallel CI fixing with worktrees
- `visual-storyteller.md` - Visual design and presentations
- `trend-researcher.md` - Market trends and product research
- `security-news-curator.md` - Security news curation

Shared sections in `shared/`:
- `autonomous-operation.md` - Auto-accept edits mode rules (included by all agents)
- `completion-handoff.md` - Completion assessment protocol (included by all agents)
- `critical-rules.md` - The 17 critical rules for delegation

## Commands
- `/deliberate` - Force structured reasoning analysis before implementation

## Dependencies

@memory.md
@commands.md
```
