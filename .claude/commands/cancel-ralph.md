---
name: cancel-ralph
description: Cancel the active Ralph Wiggum loop and return to normal operation.
---

# Cancel Ralph Wiggum Loop

You are cancelling an active Ralph Wiggum loop.

## Action Required

Execute the following to cancel the loop:

```python
import sys
import os
sys.path.insert(0, os.path.expanduser("~/.claude/hooks"))
from ralph_state import RalphState

ralph = RalphState()

if ralph.is_active():
    state = ralph.get_state()
    final_state = ralph.cancel_loop(reason="user_cancelled")

    print(f"Ralph loop cancelled.")
    print(f"  - Iterations completed: {final_state.get('current_iteration', 0)}")
    print(f"  - Started at: {final_state.get('started_at', 'unknown')}")
    print(f"  - Original task: {final_state.get('prompt', 'unknown')[:100]}...")
else:
    print("No active Ralph loop to cancel.")
```

## After Cancellation

Report to the user:
1. Whether a loop was active
2. How many iterations were completed
3. What the original task was

The Stop hook will no longer intercept exits, and normal operation resumes.
