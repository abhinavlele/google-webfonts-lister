# Agent Model Optimization Test Cases

This document validates the model optimization strategy implemented for Claude agents.

## Optimization Strategy Summary

### Speed-Optimized Agents (Sonnet)
These agents handle procedural, pattern-based tasks where speed matters more than deep reasoning:

| Agent | Task Type | Why Sonnet Works |
|-------|-----------|------------------|
| `test-writer-fixer` | Test execution, template-based test writing | Follows established patterns, procedural |
| `trend-researcher` | Web search, summarization | Information gathering, not deep analysis |
| `ci-fixer-parallel` | CI fix execution | Procedural fixes, pattern matching |
| `git-worktree-expert` | Git commands | Command execution, procedural |
| `security-news-curator` | Web research, summarization | Summarization task |

### Quality-Critical Agents (Opus - Default)
These agents require deep reasoning, complex coordination, or produce critical output:

| Agent | Task Type | Why Opus Required |
|-------|-----------|-------------------|
| `orchestrator` | Task decomposition, coordination | Complex decision-making |
| `deliberate-analyst` | Deep analysis, assumption surfacing | Requires extended thinking |
| `ruby-developer` | Code generation | Code quality is paramount |
| `backend-architect` | Architectural decisions | Long-term implications |

## Test Case 1: Deliberate-First Behavior Validation

**Objective**: Verify that deliberate analysis is now the DEFAULT behavior.

**Test Steps**:
1. Start a new Claude Code session
2. Issue a non-trivial task: "Add rate limiting to the API"
3. Verify Claude performs deliberate analysis BEFORE any implementation

**Expected Behavior**:
```
Task received: "Add rate limiting to the API"
     │
     ▼
STEP 1: <deliberation> block or deliberate-analyst invoked
     - Problem analysis
     - Solution options
     - Recommended approach
     - Execution plan
     │
     ▼
STEP 2: Implementation begins (orchestrator delegates)
```

**Pass Criteria**:
- [ ] Claude uses `<deliberation>` XML structure OR invokes `deliberate-analyst`
- [ ] Analysis includes problem definition, options, and recommendation
- [ ] Implementation only begins AFTER deliberation completes

## Test Case 2: Sonnet Model Speed Comparison

**Objective**: Verify Sonnet models provide faster response for procedural tasks.

**Test Steps**:
1. Run `test-writer-fixer` agent with a simple test task
2. Measure time to first response
3. Compare with previous Opus baseline (if available)

**Expected Improvement**:
- Sonnet: ~2-3x faster for first token
- Quality should remain acceptable for procedural tasks

**Sample Task**:
```
Run tests for the User model and fix any failures
```

## Test Case 3: Quality Preservation for Critical Agents

**Objective**: Verify Opus agents maintain high quality output.

**Test Steps**:
1. Run `deliberate-analyst` on a complex task
2. Verify analysis quality (assumptions surfaced, options explored, risks identified)

**Sample Task**:
```
Analyze the tradeoffs of migrating from REST to GraphQL for our API
```

**Quality Criteria**:
- [ ] Multiple solution options presented
- [ ] Tradeoffs explicitly stated
- [ ] Risks identified with mitigations
- [ ] Clear recommendation with rationale

## Configuration Verification

### Files Modified

1. **`test-writer-fixer.md`** - Added `model: sonnet`
2. **`trend-researcher.md`** - Added `model: sonnet`
3. **`CLAUDE.md`** - Updated to make deliberate-first MANDATORY

### Verify Model Configuration

Run this check to verify agent model assignments:

```bash
# Check agents with explicit model specification
grep -r "^model:" ~/.claude/agents/
```

**Expected Output**:
```
security-auditor.md:model: sonnet
ci-fixer-parallel.md:model: sonnet
git-worktree-expert.md:model: sonnet
security-news-curator.md:model: sonnet
test-writer-fixer.md:model: sonnet    # NEW
trend-researcher.md:model: sonnet      # NEW
```

**Agents using default (Opus)**:
- orchestrator.md (no model line = Opus)
- deliberate-analyst.md (no model line = Opus)
- ruby-developer.md (no model line = Opus)
- backend-architect.md (no model line = Opus)

## Performance Expectations

| Metric | Sonnet Agents | Opus Agents |
|--------|---------------|-------------|
| Time to first token | ~1-2s | ~3-5s |
| Total response time | 30-50% faster | Baseline |
| Reasoning depth | Adequate for procedural | Deep analysis |
| Code quality | Good for tests | Excellent |

## Rollback Plan

If issues arise, revert by removing `model: sonnet` lines from:
- `test-writer-fixer.md`
- `trend-researcher.md`

This will cause them to inherit the default Opus model.
