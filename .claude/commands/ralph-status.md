---
name: ralph-status
description: Check the current status of any active Ralph Wiggum loop.
---

# Ralph Wiggum Loop Status

Check and report the current Ralph loop status.

## Action Required

Execute the following to check status:

```python
import sys
import os
sys.path.insert(0, os.path.expanduser("~/.claude/hooks"))
from ralph_state import RalphState

ralph = RalphState()
state = ralph.get_state()

if state.get('active'):
    print("Ralph Loop: ACTIVE")
    print(f"  Iteration: {state.get('current_iteration', 0)}")
    if state.get('max_iterations'):
        print(f"  Max iterations: {state.get('max_iterations')}")
    else:
        print(f"  Max iterations: unlimited")
    print(f"  Completion promise: {state.get('completion_promise', 'none')}")
    print(f"  Started: {state.get('started_at', 'unknown')}")
    print(f"  Last iteration: {state.get('last_iteration_at', 'not yet')}")
    print(f"  Working directory: {state.get('working_directory', 'unknown')}")
    print(f"\nTask:")
    print(f"  {state.get('prompt', 'unknown')}")
else:
    print("Ralph Loop: INACTIVE")
    print("No active loop. Start one with /ralph-loop")
```

## Report Format

Present the status to the user in a clear format:

### If Active
```
Ralph Loop Status: ACTIVE
- Current iteration: X / Y (or X / unlimited)
- Completion promise: "PROMISE_TEXT"
- Started: TIMESTAMP
- Task: TASK_DESCRIPTION
```

### If Inactive
```
Ralph Loop Status: INACTIVE
Start a loop with: /ralph-loop "your task" --completion-promise "DONE"
```
