"""
Shared utilities for Claude Code hooks system
"""
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

# Lazy import langfuse_observer to avoid import errors if not installed
_langfuse_observer = None


def _get_langfuse_observer():
    """Lazy load langfuse_observer module"""
    global _langfuse_observer
    if _langfuse_observer is None:
        try:
            from . import langfuse_observer as lf
            _langfuse_observer = lf
        except ImportError:
            try:
                import langfuse_observer as lf
                _langfuse_observer = lf
            except ImportError:
                _langfuse_observer = False  # Mark as unavailable
    return _langfuse_observer if _langfuse_observer else None


class SessionTracker:
    """Manages session data collection across all hook events"""

    def __init__(self):
        # Create user-specific temporary directory to avoid sharing between users
        user_id = os.getuid() if hasattr(os, 'getuid') else os.environ.get('USER', 'unknown')
        self.session_dir = Path(tempfile.gettempdir()) / f"claude_session_tracking_{user_id}"
        self.session_dir.mkdir(exist_ok=True, mode=0o700)  # User-only permissions

    def get_session_file(self, session_id: str) -> Path:
        """Get the data file for a specific session"""
        return self.session_dir / f"session_{session_id}.json"

    def load_session_data(self, session_id: str) -> Dict[str, Any]:
        """Load existing session data or create new"""
        session_file = self.get_session_file(session_id)
        if session_file.exists():
            try:
                with open(session_file, 'r') as f:
                    return json.load(f)
            except Exception:
                pass

        # Initialize new session data
        return {
            "session_id": session_id,
            "start_time": datetime.now().isoformat(),
            "cwd": None,
            "repo_name": None,
            "events": [],
            "tool_usage": {},
            "patterns": [],
            "user_interactions": [],
            "errors": [],
            "performance_metrics": {}
        }

    def save_session_data(self, session_id: str, data: Dict[str, Any]):
        """Save session data to file"""
        session_file = self.get_session_file(session_id)
        with open(session_file, 'w') as f:
            json.dump(data, f, indent=2)

    def add_event(self, session_id: str, event_type: str, event_data: Dict[str, Any]):
        """Add an event to session tracking"""
        data = self.load_session_data(session_id)

        # Extract repo name from cwd if available
        if event_data.get('cwd') and not data.get('repo_name'):
            cwd_path = Path(event_data['cwd'])
            # Look for git repo name
            try:
                import subprocess
                result = subprocess.run(
                    ['git', 'remote', 'get-url', 'origin'],
                    cwd=cwd_path,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    repo_url = result.stdout.strip()
                    if '/' in repo_url:
                        data['repo_name'] = repo_url.split('/')[-1].replace('.git', '')
                else:
                    # Fallback to directory name
                    data['repo_name'] = cwd_path.name
            except Exception:
                data['repo_name'] = cwd_path.name if cwd_path else 'unknown'

        data['cwd'] = event_data.get('cwd', data.get('cwd'))

        # Add timestamped event
        event_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": event_type,
            "data": event_data
        }
        data['events'].append(event_entry)

        self.save_session_data(session_id, data)

        # Send to Langfuse if enabled
        self._send_to_langfuse(session_id, event_type, event_data)

    def _send_to_langfuse(self, session_id: str, event_type: str, event_data: Dict[str, Any]):
        """Send event to Langfuse for observability"""
        lf = _get_langfuse_observer()
        if not lf or not lf.is_enabled():
            return

        try:
            if event_type == 'session_start':
                lf.trace_session_start(
                    session_id=session_id,
                    cwd=event_data.get('cwd'),
                    project_type=event_data.get('project_type'),
                    git_state=event_data.get('git_state'),
                    permission_mode=event_data.get('permission_mode'),
                )
            elif event_type == 'session_end':
                lf.trace_session_end(
                    session_id=session_id,
                    reason=event_data.get('reason'),
                )
            elif event_type == 'user_prompt_submit':
                lf.trace_user_prompt(
                    session_id=session_id,
                    prompt=event_data.get('prompt_text', ''),
                )
            elif event_type == 'pre_tool_use':
                lf.trace_tool_start(
                    session_id=session_id,
                    tool_name=event_data.get('tool_name', 'unknown'),
                    tool_input=event_data.get('tool_input', {}),
                    tool_use_id=event_data.get('tool_use_id'),
                )
            elif event_type == 'post_tool_use':
                lf.trace_tool_end(
                    session_id=session_id,
                    tool_name=event_data.get('tool_name', 'unknown'),
                    tool_input=event_data.get('tool_input', {}),
                    tool_response=event_data.get('tool_response', {}),
                    tool_use_id=event_data.get('tool_use_id'),
                    success=event_data.get('success', True),
                )
            elif event_type == 'stop':
                lf.trace_stop(
                    session_id=session_id,
                    reason=event_data.get('reason'),
                )
        except Exception as e:
            log_event(f"[Langfuse] Error sending {event_type}: {e}")

    def get_repo_name(self, cwd: Optional[str]) -> str:
        """Extract repository name from working directory"""
        if not cwd:
            return 'unknown'

        cwd_path = Path(cwd)

        # Try to get git repo name
        try:
            import subprocess
            result = subprocess.run(
                ['git', 'remote', 'get-url', 'origin'],
                cwd=cwd_path,
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                repo_url = result.stdout.strip()
                if '/' in repo_url:
                    return repo_url.split('/')[-1].replace('.git', '')
        except Exception:
            pass

        # Fallback to directory name
        return cwd_path.name


def read_hook_input() -> Dict[str, Any]:
    """Read and parse hook input from stdin"""
    try:
        return json.load(sys.stdin)
    except Exception as e:
        print(f"Error reading hook input: {e}", file=sys.stderr)
        return {}


def log_event(message: str):
    """Log a message for debugging"""
    print(f"[{datetime.now().isoformat()}] {message}", file=sys.stderr)


def safe_exit(code: int = 0):
    """Exit safely with proper cleanup"""
    sys.exit(code)


def create_error_issue(
    error_message: str,
    traceback_str: str,
    hook_name: str,
    session_id: str = None,
    repo_name: str = None,
    additional_context: Dict[str, Any] = None
) -> Optional[str]:
    """Create a GitHub issue for hook errors to track and debug later.

    Returns the issue URL if successful, None otherwise.
    """
    import subprocess

    # Target repo for hook issues
    target_repo = "leleabhinav/dotfiles"

    # Build issue title
    title = f"[Hook Error] {hook_name}: {error_message[:80]}"
    if len(error_message) > 80:
        title += "..."

    # Build issue body
    body_parts = [
        "## Hook Error Report",
        "",
        f"**Hook:** `{hook_name}`",
        f"**Timestamp:** {datetime.now().isoformat()}",
    ]

    if session_id:
        body_parts.append(f"**Session ID:** `{session_id}`")
    if repo_name:
        body_parts.append(f"**Working Repo:** `{repo_name}`")

    body_parts.extend([
        "",
        "## Error Message",
        "```",
        error_message,
        "```",
        "",
        "## Traceback",
        "```python",
        traceback_str,
        "```",
    ])

    if additional_context:
        body_parts.extend([
            "",
            "## Additional Context",
            "```json",
            json.dumps(additional_context, indent=2, default=str),
            "```",
        ])

    body_parts.extend([
        "",
        "---",
        "*Auto-generated by Claude Code hooks error tracking*",
    ])

    body = "\n".join(body_parts)

    try:
        result = subprocess.run(
            [
                'gh', 'issue', 'create',
                '--repo', target_repo,
                '--title', title,
                '--body', body,
                '--label', 'bug,hooks,auto-generated',
            ],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            issue_url = result.stdout.strip()
            log_event(f"Created error issue: {issue_url}")
            return issue_url
        else:
            # Try without labels if they don't exist
            result = subprocess.run(
                [
                    'gh', 'issue', 'create',
                    '--repo', target_repo,
                    '--title', title,
                    '--body', body,
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                issue_url = result.stdout.strip()
                log_event(f"Created error issue (no labels): {issue_url}")
                return issue_url
            log_event(f"Failed to create error issue: {result.stderr}")
            return None

    except Exception as e:
        log_event(f"Exception creating error issue: {str(e)}")
        return None