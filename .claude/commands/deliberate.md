---
name: deliberate
description: Force structured reasoning and analysis before implementation. Use when facing ambiguous requirements, architectural decisions, or when you want to slow down and think through a problem thoroughly.
---

# Deliberate Thinking Protocol

Before implementing anything, analyze this request using structured reasoning.

**Request to analyze**: $ARGUMENTS

---

<deliberation>

## 1. UNDERSTAND - What is actually being asked?

<understanding>
### Stated Request
> [Quote the user's exact words]

### Underlying Goal
- What problem is this solving?
- Why does the user want this?
- What happens if we don't do this?

### Assumptions I'm Making
| Assumption | Risk if Wrong | How to Verify |
|------------|---------------|---------------|
| | | |

### Questions to Clarify
- [ ] Question 1 (if any)
- [ ] Question 2 (if any)
</understanding>

## 2. CONTEXT - What exists and what's affected?

<context>
### Relevant Existing Code
Search the codebase for:
- Similar patterns/implementations
- Files that will be affected
- Test patterns in use

### Blast Radius
- **Direct changes**: Files that must change
- **Indirect effects**: Files that might be affected
- **Tests**: Test files needing updates

### Constraints
- Technical: [language, framework, patterns]
- Quality: [test requirements, lint rules]
- Security: [auth, data handling concerns]
</context>

## 3. OPTIONS - What are the possible approaches?

<options>
### Option A: Minimal Change
**Description**: Smallest change that could work
**Effort**: Low
**Risk**:
**Pros**:
-
**Cons**:
-

### Option B: Comprehensive Solution
**Description**: Full solution with edge cases
**Effort**: Medium/High
**Risk**:
**Pros**:
-
**Cons**:
-

### Option C: Alternative Approach
**Description**: Different paradigm
**Effort**:
**Risk**:
**Pros**:
-
**Cons**:
-
</options>

## 4. RECOMMENDATION - What should we do?

<recommendation>
### Selected Approach
[Name] because:
1. Reason 1
2. Reason 2
3. Reason 3

### Tradeoffs Accepted
- Accepting [X] because [Y]

### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| | |
</recommendation>

## 5. EXECUTION PLAN - How do we implement?

<execution>
### Preconditions
- [ ] Tests passing
- [ ] Branch created
- [ ] Dependencies identified

### Steps with Checkpoints
1. **[Phase Name]**
   - Step 1
   - Step 2
   - **Checkpoint**: [Verify X before proceeding]

2. **[Phase Name]**
   - Step 1
   - Step 2
   - **Checkpoint**: [Verify Y before proceeding]

3. **Verification**
   - Run tests
   - Run linters
   - Manual verification
   - **Checkpoint**: All quality gates pass

### Rollback Plan
If something breaks:
1. How to detect
2. How to revert
3. Who to notify
</execution>

</deliberation>

---

## Ready for Implementation?

- [ ] Requirements are clear (no ambiguity)
- [ ] Approach is validated (considered alternatives)
- [ ] Risks are acceptable (mitigations in place)
- [ ] Checkpoints are defined (know when to pause)

**Proceed with**: [orchestrator / specific agent] to implement the selected approach.
