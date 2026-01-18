"""
Ralph Wiggum Loop State Manager

Manages the state for iterative self-referential development loops.
The Ralph loop intercepts Claude's exit attempts and re-feeds the same prompt
until completion criteria are met.

Named after Ralph Wiggum from The Simpsons - embodying persistent iteration despite setbacks.

Reference: https://ghuntley.com/ralph/
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any


class RalphState:
    """Manages Ralph Wiggum loop state across Claude sessions."""

    def __init__(self):
        # Store state in user's home directory for persistence across sessions
        self.state_file = Path.home() / ".claude" / "ralph_state.json"
        self.state_file.parent.mkdir(parents=True, exist_ok=True)

    def _load_state(self) -> Dict[str, Any]:
        """Load current Ralph state from disk."""
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return self._empty_state()
        return self._empty_state()

    def _save_state(self, state: Dict[str, Any]) -> None:
        """Save Ralph state to disk."""
        with open(self.state_file, 'w') as f:
            json.dump(state, f, indent=2)

    def _empty_state(self) -> Dict[str, Any]:
        """Return empty/inactive state."""
        return {
            "active": False,
            "prompt": None,
            "completion_promise": None,
            "max_iterations": None,
            "current_iteration": 0,
            "started_at": None,
            "last_iteration_at": None,
            "working_directory": None,
            "session_id": None,
            "history": []
        }

    def is_active(self) -> bool:
        """Check if a Ralph loop is currently active."""
        state = self._load_state()
        return state.get("active", False)

    def start_loop(
        self,
        prompt: str,
        completion_promise: Optional[str] = None,
        max_iterations: Optional[int] = None,
        working_directory: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Start a new Ralph loop.

        Args:
            prompt: The task prompt to repeat each iteration
            completion_promise: Text that signals completion (e.g., "COMPLETE")
            max_iterations: Maximum iterations before auto-stop (None = unlimited)
            working_directory: Directory to run in
            session_id: Claude session ID

        Returns:
            The new state
        """
        state = {
            "active": True,
            "prompt": prompt,
            "completion_promise": completion_promise,
            "max_iterations": max_iterations,
            "current_iteration": 0,
            "started_at": datetime.now().isoformat(),
            "last_iteration_at": None,
            "working_directory": working_directory or os.getcwd(),
            "session_id": session_id,
            "history": []
        }
        self._save_state(state)
        return state

    def increment_iteration(self) -> Dict[str, Any]:
        """Increment the iteration counter and return updated state."""
        state = self._load_state()
        if state["active"]:
            state["current_iteration"] += 1
            state["last_iteration_at"] = datetime.now().isoformat()
            state["history"].append({
                "iteration": state["current_iteration"],
                "timestamp": state["last_iteration_at"]
            })
            self._save_state(state)
        return state

    def check_completion(self, output_text: str) -> bool:
        """
        Check if the completion promise is found in the output.

        Args:
            output_text: Claude's output to check for completion promise

        Returns:
            True if completion promise found, False otherwise
        """
        state = self._load_state()
        if not state["active"]:
            return True  # Not active means "complete" (don't loop)

        promise = state.get("completion_promise")
        if not promise:
            return False  # No promise defined, never auto-complete

        # Check for promise in output (case-sensitive)
        return promise in output_text

    def check_max_iterations(self) -> bool:
        """
        Check if max iterations has been reached.

        Returns:
            True if max iterations reached, False otherwise
        """
        state = self._load_state()
        if not state["active"]:
            return True

        max_iter = state.get("max_iterations")
        if max_iter is None:
            return False  # No limit

        return state.get("current_iteration", 0) >= max_iter

    def get_prompt(self) -> Optional[str]:
        """Get the current loop prompt."""
        state = self._load_state()
        return state.get("prompt") if state["active"] else None

    def get_state(self) -> Dict[str, Any]:
        """Get the full current state."""
        return self._load_state()

    def cancel_loop(self, reason: str = "user_cancelled") -> Dict[str, Any]:
        """
        Cancel the current Ralph loop.

        Args:
            reason: Reason for cancellation

        Returns:
            Final state before clearing
        """
        state = self._load_state()
        final_state = {
            **state,
            "cancelled_at": datetime.now().isoformat(),
            "cancel_reason": reason
        }

        # Clear active state
        self._save_state(self._empty_state())

        return final_state

    def complete_loop(self) -> Dict[str, Any]:
        """
        Mark the loop as successfully completed.

        Returns:
            Final state before clearing
        """
        state = self._load_state()
        final_state = {
            **state,
            "completed_at": datetime.now().isoformat(),
            "status": "completed"
        }

        # Clear active state
        self._save_state(self._empty_state())

        return final_state

    def should_continue(self, output_text: str = "") -> tuple[bool, str]:
        """
        Determine if the loop should continue.

        Args:
            output_text: Claude's output from this iteration

        Returns:
            Tuple of (should_continue: bool, reason: str)
        """
        state = self._load_state()

        if not state["active"]:
            return False, "no_active_loop"

        # Check for completion promise
        if self.check_completion(output_text):
            self.complete_loop()
            return False, "completion_promise_found"

        # Check max iterations
        if self.check_max_iterations():
            self.cancel_loop("max_iterations_reached")
            return False, "max_iterations_reached"

        return True, "continue"


# Convenience functions for use in hooks
def get_ralph_state() -> RalphState:
    """Get a RalphState instance."""
    return RalphState()


def is_ralph_active() -> bool:
    """Quick check if Ralph loop is active."""
    return RalphState().is_active()
