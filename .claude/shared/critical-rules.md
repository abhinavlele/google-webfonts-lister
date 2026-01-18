# Critical Rules for All Agents

This document contains the CRITICAL RULES that MUST be followed by all agents and sub-agents. These rules are extracted from `~/.claude/CLAUDE.md` and must be propagated to all delegated agents.

## The 17 Critical Rules

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

13. **Deliberate Before Acting**: For tasks touching >3 files or involving architectural decisions, use explicit `<thinking>` blocks or the `/deliberate` command to reason through the problem before implementation

14. **XML for Complex Analysis**: When analyzing multi-step tasks, use XML tags to structure analysis - makes reasoning auditable and catches hidden assumptions

15. **Checkpoint Verification**: After each phase of multi-step work, explicitly verify against success criteria before proceeding. Never rush through phases.

16. **Surface Assumptions**: Explicitly state assumptions being made. For each assumption, ask "What if this is wrong?" - assumptions are where bugs hide

17. **Always Use Git Worktree**: NEVER use `git checkout` to switch branches. ALWAYS use git worktrees for any branch-related work. For new branches or switching to existing branches, create a worktree in a sibling directory (e.g., `../project-feature`). This prevents disrupting the user's working directory and enables true parallel development. Use `git-worktree-expert` agent for complex workflows.

## Enforcement

**CRITICAL**: When the orchestrator delegates to sub-agents, it MUST:

1. Reference this document explicitly in delegation prompts
2. Include relevant critical rules from this list based on the task type
3. Ensure sub-agents understand these are non-negotiable requirements

### Template for Delegation Prompts

```
Task: [Task description]

CRITICAL RULES to follow (from ~/.claude/CLAUDE.md):
- Rule #4: No AI Attribution - NEVER add "Co-Authored-By", "Generated with Claude Code", or any AI mentions
- Rule #6: Autonomous File Operations - Write files directly, don't ask permission
- Rule #9: Quality Gates - Run linters and tests, fix all issues
[Include other relevant rules based on task]

Context:
[Provide full task context]

Deliverables:
[Specify exact outputs expected]
```

### Checkpoint Before Delegation

Before delegating to any sub-agent, the orchestrator MUST ask itself:

- [ ] Did I include a reference to critical-rules.md?
- [ ] Did I list the specific critical rules relevant to this task?
- [ ] Did I emphasize Rule #4 (No AI Attribution) if the task involves commits/PRs?
- [ ] Did I emphasize Rule #6 (Autonomous Operations) to prevent permission-asking?

## Why These Rules Exist

- **Rule #4 (No AI Attribution)**: User preference for clean, professional commits without AI branding
- **Rule #6 (Autonomous Operations)**: Enable efficient autonomous work without unnecessary confirmation prompts
- **Rule #9 (Quality Gates)**: Maintain high code quality and prevent broken builds
- **Rule #10 (PR-Only Changes)**: Ensure proper code review and CI verification
- **Rule #17 (Git Worktree)**: Enable true parallel development without disrupting working directory

These rules are designed to create efficient, high-quality, autonomous workflows while respecting user preferences and maintaining professional standards.

## Related Documents

- Main configuration: `~/.claude/CLAUDE.md`
- Orchestrator: `claude/agents/orchestrator.md`
- Agent definitions: `claude/agents/*.md`
- Commands: `claude/commands/*.md`
- Shared sections: `claude/shared/*.md` (autonomous-operation.md, completion-handoff.md)

## Detecting Permission-Asking Violations

When agents violate Critical Rules #6 and #7 (autonomous operation), they exhibit specific patterns. Use this guide to identify and address violations.

### Violation Patterns to Watch For

**Permission-Asking Phrases (FORBIDDEN):**
```
❌ "Should I create this file?"
❌ "Would you like me to write this?"
❌ "May I proceed with..."
❌ "Shall I implement..."
❌ "Do you want me to..."
❌ "Let me know if you'd like me to..."
❌ "Can I go ahead and..."
❌ "Is it okay if I..."
❌ "Do you approve..."
❌ "Please confirm before I..."
```

**Correct Autonomous Behavior:**
```
✅ "I'll create the configuration file now."
✅ "Creating test file for the new feature."
✅ "Updating the authentication module."
✅ "I've added the security headers to the API."
✅ [Just does the work without asking]
```

### Examples by Scenario

#### Scenario 1: Creating New Files

**WRONG (Permission-Asking):**
```
Agent: "I'll need to create a new config file. Should I create 
`config/api_settings.yml` with these settings?"
```

**CORRECT (Autonomous):**
```
Agent: "Creating `config/api_settings.yml` with the API configuration."
[Uses Write tool immediately]
```

#### Scenario 2: Modifying Existing Code

**WRONG (Permission-Asking):**
```
Agent: "I can update the authentication logic to fix this vulnerability. 
Would you like me to proceed with the changes?"
```

**CORRECT (Autonomous):**
```
Agent: "Updating authentication logic to address the SQL injection vulnerability."
[Makes changes using Write/Edit tool immediately]
```

#### Scenario 3: Running Tests or Linters

**WRONG (Permission-Asking):**
```
Agent: "The code changes are complete. Should I run the tests now?"
```

**CORRECT (Autonomous):**
```
Agent: "Running test suite to verify the changes."
[Executes bundle exec rspec immediately]
```

#### Scenario 4: Implementing Multi-Step Tasks

**WRONG (Permission-Asking):**
```
Agent: "I'll need to:
1. Create the model file
2. Add validations
3. Write tests

May I proceed with these steps?"
```

**CORRECT (Autonomous):**
```
Agent: "Implementing user authentication feature:
1. Creating User model with validations
2. Adding RSpec tests
3. Running test suite to verify"

[Executes all steps immediately without waiting for confirmation]
```

### Root Causes of Violations

1. **Missing Autonomous Section**: Agent configuration doesn't have the "CRITICAL: Autonomous Operation" section
2. **Weak Delegation Language**: Orchestrator didn't emphasize auto-accept mode in delegation prompt
3. **Agent Training Gap**: Base model behavior defaults to asking permission (polite but inefficient)
4. **Unclear Scope**: Agent unsure if task falls within authorized scope

### Fixing Violations

#### Fix 1: Update Agent Configuration
Ensure EVERY agent has the standardized autonomous section immediately after the opening paragraph.

#### Fix 2: Strengthen Orchestrator Delegation
When delegating, ALWAYS include:
```
CRITICAL: AUTO-ACCEPT EDITS MODE IS ENABLED
You are operating in autonomous mode. Execute immediately without asking for permission.
```

#### Fix 3: Reinforce in Follow-Up
If agent asks for permission despite the rules, respond firmly:
```
"You are in auto-accept edits mode. Execute autonomously without asking. 
Refer to the CRITICAL: Autonomous Operation section in your configuration."
```

### Legitimate Cases Requiring Confirmation

These operations STILL require user confirmation despite auto-accept mode:

1. **Destructive Directory Operations:**
   ```
   ❌ rm -rf directory/   # Must ask first
   ✅ rm specific_file.txt  # Can do autonomously
   ```

2. **Production System Changes:**
   ```
   ❌ Direct changes to production databases
   ❌ Modifying live infrastructure without review
   ```

3. **Explicitly Marked Operations:**
   Any operation marked in CLAUDE.md as "requires confirmation"

### Verification Commands

After implementing autonomous operation fixes, verify agents are complying:

```bash
# Check recent agent responses for permission-asking phrases
grep -r "Should I" claude/agents/*.md
grep -r "Would you like me" claude/agents/*.md
grep -r "May I proceed" claude/agents/*.md

# Verify all agents have autonomous sections
for f in claude/agents/*.md; do
  if ! grep -q "CRITICAL: Autonomous Operation" "$f"; then
    echo "Missing autonomous section: $f"
  fi
done
```

### Success Criteria

Autonomous operation is working correctly when:

- ✅ Agents create/modify files immediately without asking
- ✅ Agents execute tasks in auto-accept mode without permission prompts
- ✅ Agents only ask for confirmation on explicitly dangerous operations
- ✅ All agent .md files have "CRITICAL: Autonomous Operation" section
- ✅ Orchestrator delegation templates emphasize auto-accept mode
- ✅ User can see continuous progress without interruption

### Monitoring and Continuous Improvement

**Weekly Review:**
- Audit recent agent interactions for permission-asking patterns
- Update agent configurations if new violations emerge
- Reinforce autonomous behavior in agent training

**When Adding New Agents:**
- Include "CRITICAL: Autonomous Operation" section from the start
- Test autonomous behavior before deploying agent
- Verify orchestrator delegation includes auto-accept emphasis

By following these guidelines, you ensure that auto-accept edits mode delivers its intended benefit: uninterrupted, efficient autonomous operation.
