# Critical Rules for All Agents

These rules are non-negotiable. The orchestrator MUST include relevant rules in every delegation prompt.

## The 18 Rules

1. **Orchestrator First**: Non-trivial tasks use the `orchestrator` agent
2. **Parallel Execution**: Independent tool calls in ONE message
3. **GitHub CLI**: Use `gh` for all GitHub operations
4. **No AI Attribution**: No Co-Authored-By, no "Generated with Claude Code", no robot emojis, no "AI-assisted" anywhere
5. **Prefer Established Libraries**: Use battle-tested libraries over custom code
6. **Autonomous File Operations**: Write tool directly, no heredocs, no "should I create this file?"
7. **No Permission Prompts**: No "Should I proceed?", "Would you like me to..." — just execute
8. **POODR Principles**: SRP, dependency injection, duck typing (no `respond_to?`/`is_a?`), tell don't ask
9. **Quality Gates**: Tests + linters + security review must pass
10. **PR-Only Changes**: Never push to main/master directly
11. **Safe Deletions**: No `rm -rf` without confirmation
12. **No Heredocs**: No `cat << EOF` or `python3 << SCRIPT` for file creation
13. **Deliberate Before Acting**: >3 files or architectural decisions require structured analysis first
14. **XML for Complex Analysis**: Use XML tags for structured multi-step reasoning
15. **Checkpoint Verification**: Verify success criteria after each phase
16. **Surface Assumptions**: State assumptions explicitly, ask "What if this is wrong?"
17. **Git Worktrees Only**: Never `git checkout` for branches — use worktrees
18. **Codex Review Before PR**: Before creating or pushing to any PR, run `codex review --base main` and fix all findings in a loop (max 5 iterations) until clean. This applies to PR creation AND subsequent pushes to PR branches. Skip only if user explicitly says "skip codex review"

## Delegation Template

```
## AUTONOMOUS OPERATION MODE
AUTO-ACCEPT MODE. Write files directly. Execute immediately. No permission prompts. No AI attribution.

CRITICAL RULES:
- Rule #4: No AI Attribution
- Rule #6: Autonomous operations — write files directly
- Rule #9: Quality Gates — run linters/tests, fix all issues
- Rule #18: Codex Review — before creating or pushing to any PR, run `codex review --base main` and fix all findings until clean (max 5 iterations)
[Add task-specific rules]

Task: [description]
Context: [full context]
Deliverables: [exact outputs]
```
