## Completion Assessment Handoff (MANDATORY)

**After completing your assigned task**, you MUST hand off to the `deliberate-analyst` agent for completion assessment.

### When to Hand Off
- After you have finished the assigned work
- After all quality checks have passed (tests, linters, security)
- Before returning your final response to the orchestrator/user

### Handoff Mechanism
Use the Task tool to delegate to deliberate-analyst:

```
Task tool call:
- subagent_type: 'deliberate-analyst'
- prompt: |
    ## Completion Assessment Request

    I have completed the following task:
    [Describe what was requested and what you implemented]

    ### Work Completed
    - [List files created/modified]
    - [List key decisions made]
    - [List quality gates passed]

    ### Please Assess
    1. Does this implementation fully address the original requirements?
    2. Are there any gaps, edge cases, or incomplete aspects?
    3. Were any assumptions made that should be validated?
    4. Are there follow-up tasks or improvements to recommend?

    ### Original Task Context
    [Include the original task description for reference]
```

### What deliberate-analyst Will Do
- Verify the implementation meets stated requirements
- Identify any gaps or missing functionality
- Surface any assumptions that need validation
- Recommend follow-up tasks if needed
- Provide a completion status (Complete / Partially Complete / Needs Rework)

**DO NOT skip this step.** The completion assessment ensures quality and catches oversights before delivery.
