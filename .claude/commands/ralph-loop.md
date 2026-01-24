---
name: ralph-loop
description: Start an iterative Ralph Wiggum loop that continues until completion criteria are met. Claude will keep working on the task, seeing its previous work via modified files and git history.
---

# Ralph Wiggum Loop

You are starting a Ralph Wiggum iterative development loop. This creates a self-referential feedback system where you will continue working on the task until completion criteria are met.

## How This Works

1. You receive a task with clear completion criteria
2. You work on the task
3. When you try to stop, the Stop hook intercepts
4. If completion criteria aren't met, you're re-fed the same prompt
5. You see your previous work via modified files and git history
6. Loop continues until:
   - Completion promise is found in your output (wrapped in `<promise></promise>` tags)
   - Max iterations reached
   - User cancels with `/cancel-ralph`

## Your Task

**Arguments received**: $ARGUMENTS

## Parse the Arguments

Extract from the arguments:
1. **Task prompt**: The main task description
2. **Completion promise** (optional): Text you must output when done (default: use `<promise>COMPLETE</promise>`)
3. **Max iterations** (required for safety): Safety limit on iterations

### Argument Format Examples

```
/ralph-loop "Build a REST API with tests" --max-iterations 20
/ralph-loop "Fix all linter errors in src/" --completion-promise "ALL_CLEAN" --max-iterations 10
/ralph-loop "Implement feature X following TDD" --completion-promise "DONE" --max-iterations 30
```

## CRITICAL: Safety First

**ALWAYS set `--max-iterations`**. This cannot be overstated.

The completion promise uses exact string matching. If Claude fails to output it correctly, the loop continues indefinitely without an iteration limit. Treat `--max-iterations` as your primary safety mechanism, not an optional parameter.

If no `--max-iterations` is provided, **strongly recommend the user add one** before proceeding.

## Initialize the Loop

Use the following Python code to start the Ralph loop:

```python
import sys
import os
sys.path.insert(0, os.path.expanduser("~/.claude/hooks"))
from ralph_state import RalphState

# Parse your arguments to extract:
# - prompt: The task description
# - completion_promise: The text to look for (default: "COMPLETE")
# - max_iterations: Maximum loops (STRONGLY RECOMMENDED)

ralph = RalphState()
ralph.start_loop(
    prompt="<extracted task prompt>",
    completion_promise="<extracted promise or 'COMPLETE'>",
    max_iterations=<extracted max or recommend user sets one>,
    working_directory=os.getcwd()
)
```

## After Initialization

Confirm the loop is active and show the user the configuration:

```python
# After calling start_loop(), verify it's active:
state = ralph.get_state()  # NOTE: Use get_state(), NOT get_status()

if state.get('active'):
    print("Ralph loop initialized successfully!")
    print(f"  Task: {state.get('prompt', 'unknown')[:100]}...")
    print(f"  Max iterations: {state.get('max_iterations', 'unlimited')}")
    print(f"  Completion promise: {state.get('completion_promise', 'COMPLETE')}")
    print(f"  Working directory: {state.get('working_directory', os.getcwd())}")
else:
    print("ERROR: Ralph loop failed to initialize")
```

Then begin working on the task immediately.

## Each Iteration: Fresh Context Approach

At the start of each iteration, orient yourself:

1. **Check git status** - See what files have been modified
2. **Check git diff** - See what changes were made
3. **Run tests** - See current state of the test suite
4. **Read any error logs** - Understand what failed

This avoids "context rot" - each iteration starts with fresh awareness of the actual codebase state.

## Completion Requirements

When you believe the task is complete:
1. Verify ALL requirements are met
2. Run tests - they must pass
3. Run linters - they must be clean
4. Double-check the completion criteria
5. **Output the completion promise** using `<promise></promise>` tags

Example:
```
All requirements met:
- [x] API endpoints implemented
- [x] Tests passing (24/24)
- [x] Linter clean
- [x] All edge cases handled

<promise>COMPLETE</promise>
```

## Philosophy: Iteration Over Perfection

Treat failures as data, not catastrophes:
- Each failure is a "deterministic, predictable data point"
- The loop lets you systematically address issues
- Persistence through refinement cycles is the goal
- Don't aim for perfect on first try - let the loop refine

## Important Notes

- **Be persistent**: If something fails, fix it and try again
- **Check your work**: Use git status, run tests, check for errors
- **Fresh context**: Re-orient each iteration by checking actual state
- **Signal completion clearly**: The completion promise must appear verbatim
- **Exact matching**: The Stop hook uses exact string matching on the promise

## Safety Reminders

- `--max-iterations` is your PRIMARY safety mechanism
- The loop runs with your environment's credentials
- Recommended: Run in sandboxed environments for autonomous work
- User can always cancel with `/cancel-ralph`

---

Now parse the arguments and initialize the Ralph loop. If no `--max-iterations` was provided, warn the user and recommend they add one. Then begin working on the task.
