"""
SessionEnd Hook - Log session data to GitHub organized by hook type
"""
import sys
import os
import json
import subprocess
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# Add current directory for shared_utils
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit, create_error_issue


class SessionDataLogger:
    """Logs Claude session data to GitHub organized by hook type"""

    def __init__(self):
        self.llm_scratchpad_repo = "abhinavlele/llm-scratchpad"
        self.scratchpad_dir = Path.home() / "src" / "abhinavlele" / "llm-scratchpad"
        self.session_tracker = SessionTracker()

    def process_session(self, session_id: str, transcript_path: str, cwd: str, reason: str):
        """Process a completed session and log data to GitHub"""
        try:
            log_event(f"Processing session {session_id}, reason: {reason}")

            # Load session data
            session_data = self.session_tracker.load_session_data(session_id)
            if not session_data:
                log_event(f"No session data found for {session_id}")
                return

            # Get repo name
            repo_name = session_data.get('repo_name') or self.session_tracker.get_repo_name(cwd)

            # Setup scratchpad repository
            if not self._setup_scratchpad_repo():
                log_event("Failed to setup scratchpad repository")
                return

            # Create branch for this session
            branch_name = self._create_session_branch(session_id, repo_name)

            # Log session data organized by hook type
            self._log_session_data(session_data, repo_name, session_id, reason)

            # Create and merge PR
            pr_url = self._create_and_merge_pr(branch_name, session_id, repo_name, reason)

            if pr_url:
                log_event(f"Successfully created and merged PR: {pr_url}")
            else:
                log_event("Failed to create or merge PR")

            # Cleanup session data
            self._cleanup_session_data(session_id)

        except Exception as e:
            import traceback
            tb_str = traceback.format_exc()
            log_event(f"Error processing session: {str(e)}")
            log_event(f"Traceback: {tb_str}")

            # Create GitHub issue for the error
            try:
                error_repo_name = repo_name
            except NameError:
                error_repo_name = None

            create_error_issue(
                error_message=str(e),
                traceback_str=tb_str,
                hook_name="session_end",
                session_id=session_id,
                repo_name=error_repo_name,
                additional_context={
                    "cwd": cwd,
                    "reason": reason,
                    "transcript_path": transcript_path,
                }
            )

    def _setup_scratchpad_repo(self) -> bool:
        """Setup or update the llm-scratchpad repository"""
        try:
            if not self.scratchpad_dir.exists():
                log_event("Cloning llm-scratchpad repository")
                result = subprocess.run([
                    'git', 'clone', f'git@github.com:{self.llm_scratchpad_repo}.git',
                    str(self.scratchpad_dir)
                ], capture_output=True, text=True)

                if result.returncode != 0:
                    log_event(f"Failed to clone repository: {result.stderr}")
                    return False

            # Ensure we're in the repo directory
            os.chdir(self.scratchpad_dir)

            # Abort any in-progress rebase/merge that might have been left behind
            subprocess.run(['git', 'rebase', '--abort'], capture_output=True)
            subprocess.run(['git', 'merge', '--abort'], capture_output=True)

            # Fetch latest from origin
            fetch_result = subprocess.run(['git', 'fetch', 'origin', 'main'], capture_output=True, text=True)
            if fetch_result.returncode != 0:
                log_event(f"Failed to fetch origin: {fetch_result.stderr}")

            # Discard any local changes and switch to main
            subprocess.run(['git', 'checkout', '--force', 'main'], capture_output=True)

            # Reset local main to match origin/main exactly
            reset_result = subprocess.run(['git', 'reset', '--hard', 'origin/main'], capture_output=True, text=True)
            if reset_result.returncode != 0:
                log_event(f"Failed to reset to origin/main: {reset_result.stderr}")
                # Fallback: try pull
                subprocess.run(['git', 'pull', 'origin', 'main', '--rebase'], capture_output=True)

            # Clean untracked files that might cause issues
            subprocess.run(['git', 'clean', '-fd'], capture_output=True)

            log_event("Scratchpad repo synced to origin/main")
            return True

        except Exception as e:
            log_event(f"Error setting up scratchpad repo: {str(e)}")
            return False

    def _create_session_branch(self, session_id: str, repo_name: str) -> str:
        """Create a new branch for this session"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        branch_name = f"claude-session/{repo_name}/{timestamp}_{session_id[:8]}"

        try:
            # Create and checkout new branch
            subprocess.run(['git', 'checkout', '-b', branch_name], capture_output=True, text=True)
            log_event(f"Created branch: {branch_name}")
            return branch_name

        except Exception as e:
            log_event(f"Error creating branch: {str(e)}")
            return f"claude-session/{repo_name}/{timestamp}"

    def _log_session_data(self, session_data: dict, repo_name: str, session_id: str, reason: str):
        """Log session data organized by hook type"""
        try:
            repo_dir = self.scratchpad_dir / repo_name
            repo_dir.mkdir(exist_ok=True)

            events = session_data.get('events', [])
            date_str = datetime.now().strftime('%Y-%m-%d')
            session_short = session_id[:8]

            # Create session metadata
            sessions_dir = repo_dir / "sessions" / session_id[:12]
            sessions_dir.mkdir(parents=True, exist_ok=True)

            metadata = {
                "session_id": session_id,
                "repo_name": repo_name,
                "start_time": session_data.get('start_time'),
                "end_time": datetime.now().isoformat(),
                "end_reason": reason,
                "cwd": session_data.get('cwd'),
                "total_events": len(events),
                "tool_usage": session_data.get('tool_usage', {}),
                "event_summary": self._summarize_events(events)
            }
            (sessions_dir / "metadata.json").write_text(
                json.dumps(metadata, indent=2, default=str),
                encoding='utf-8'
            )

            # Write all events as JSONL
            with open(sessions_dir / "events.jsonl", 'w', encoding='utf-8') as f:
                for event in events:
                    f.write(json.dumps(event, default=str) + '\n')

            # Group events by hook type
            events_by_type = defaultdict(list)
            for event in events:
                event_type = event.get('type', 'unknown')
                events_by_type[event_type].append(event)

            # Create hooks directory structure
            hooks_dir = repo_dir / "hooks"
            hooks_dir.mkdir(exist_ok=True)

            # Write events for each hook type
            for hook_type, hook_events in events_by_type.items():
                hook_type_dir = hooks_dir / hook_type
                hook_type_dir.mkdir(exist_ok=True)

                filename = f"{date_str}_{session_short}.json"
                hook_data = {
                    "session_id": session_id,
                    "repo_name": repo_name,
                    "date": date_str,
                    "event_count": len(hook_events),
                    "events": hook_events
                }

                (hook_type_dir / filename).write_text(
                    json.dumps(hook_data, indent=2, default=str),
                    encoding='utf-8'
                )

            log_event(f"Logged {len(events)} events across {len(events_by_type)} hook types for {repo_name}")

        except Exception as e:
            log_event(f"Error logging session data: {str(e)}")
            raise

    def _summarize_events(self, events: list) -> dict:
        """Generate a summary of events by type"""
        summary = defaultdict(int)
        for event in events:
            event_type = event.get('type', 'unknown')
            summary[event_type] += 1
        return dict(summary)

    def _create_and_merge_pr(self, branch_name: str, session_id: str, repo_name: str, reason: str) -> str:
        """Create PR and auto-merge"""
        try:
            # Add all changes
            subprocess.run(['git', 'add', '.'], check=True, capture_output=True)

            # Check if there are changes to commit
            result = subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True)
            if not result.stdout.strip():
                log_event("No changes to commit")
                return None

            # Commit changes
            commit_message = f"Claude session data: {repo_name}\n\nSession: {session_id}\nReason: {reason}\nTimestamp: {datetime.now().isoformat()}"

            subprocess.run([
                'git', 'commit', '-m', commit_message
            ], check=True, capture_output=True)

            # Rebase on latest main before pushing
            log_event("Rebasing on latest main before push")
            subprocess.run(['git', 'fetch', 'origin', 'main'], capture_output=True)
            rebase_result = subprocess.run(['git', 'rebase', 'origin/main'], capture_output=True, text=True)

            if rebase_result.returncode != 0:
                log_event("Rebase conflict detected, attempting resolution")
                if not self._resolve_rebase_conflicts(repo_name):
                    log_event("Failed to resolve rebase conflicts, aborting")
                    subprocess.run(['git', 'rebase', '--abort'], capture_output=True)
                    return None

            # Push branch
            subprocess.run(['git', 'push', 'origin', branch_name], check=True, capture_output=True)

            # Create PR
            pr_title = f"Session Data: {repo_name} ({datetime.now().strftime('%Y-%m-%d %H:%M')})"
            pr_body = self._generate_pr_body(session_id, repo_name, reason)

            pr_result = subprocess.run([
                'gh', 'pr', 'create',
                '--title', pr_title,
                '--body', pr_body,
                '--base', 'main',
                '--head', branch_name
            ], capture_output=True, text=True)

            if pr_result.returncode != 0:
                log_event(f"Failed to create PR: {pr_result.stderr}")
                return None

            pr_url = pr_result.stdout.strip()
            log_event(f"Created PR: {pr_url}")

            # Auto-merge the PR
            if self.llm_scratchpad_repo == "abhinavlele/llm-scratchpad":
                log_event("Auto-merging PR for llm-scratchpad repository")
                merge_result = subprocess.run([
                    'gh', 'pr', 'merge', pr_url,
                    '--squash'
                ], capture_output=True, text=True)

                if merge_result.returncode == 0:
                    log_event("PR auto-merged successfully")
                else:
                    log_event(f"Merge failed: {merge_result.stderr}")

            # Checkout main after merge
            subprocess.run(['git', 'checkout', 'main'], capture_output=True)
            subprocess.run(['git', 'pull', 'origin', 'main'], capture_output=True)

            return pr_url

        except Exception as e:
            log_event(f"Error creating/merging PR: {str(e)}")
            return None

    def _generate_pr_body(self, session_id: str, repo_name: str, reason: str) -> str:
        """Generate PR description"""
        return f"""## Session Data Log

**Repository:** {repo_name}
**Session ID:** {session_id}
**End Reason:** {reason}
**Timestamp:** {datetime.now().isoformat()}

### Data Structure

```
{repo_name}/
├── sessions/{session_id[:12]}/
│   ├── metadata.json    # Session summary and tool usage stats
│   └── events.jsonl     # All events in JSONL format
│
└── hooks/
    ├── pre_tool_use/    # Tool invocation events
    ├── post_tool_use/   # Tool completion events
    ├── user_prompt_submit/  # User prompts
    ├── permission_request/  # Permission requests
    └── ...
```

### Querying This Data

```bash
# Find all Read tool uses
jq '.events[] | select(.data.tool_name == "Read")' hooks/pre_tool_use/*.json

# Get session duration
jq '.start_time, .end_time' sessions/*/metadata.json

# Count events by type
jq '.event_summary' sessions/*/metadata.json
```
"""

    def _resolve_rebase_conflicts(self, repo_name: str) -> bool:
        """Resolve conflicts during rebase - prefer ours for JSON data"""
        try:
            status_result = subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True)
            conflict_files = []
            for line in status_result.stdout.split('\n'):
                if line.startswith('UU') or line.startswith('AA'):
                    conflict_files.append(line[3:].strip())

            if not conflict_files:
                log_event("No conflict files found")
                return False

            log_event(f"Resolving conflicts in: {conflict_files}")

            # For JSON data files, prefer ours (current session data is unique)
            for file_path in conflict_files:
                subprocess.run(['git', 'checkout', '--ours', file_path], capture_output=True)

            subprocess.run(['git', 'add', '.'], capture_output=True)

            env = os.environ.copy()
            env['GIT_EDITOR'] = 'true'
            continue_result = subprocess.run(
                ['git', 'rebase', '--continue'],
                capture_output=True,
                text=True,
                env=env
            )

            if continue_result.returncode != 0:
                log_event(f"Rebase continue failed: {continue_result.stderr}")
                return False

            log_event("Rebase conflicts resolved successfully")
            return True

        except Exception as e:
            log_event(f"Failed to resolve rebase conflicts: {str(e)}")
            return False

    def _cleanup_session_data(self, session_id: str):
        """Clean up session tracking data"""
        try:
            session_file = self.session_tracker.get_session_file(session_id)
            if session_file.exists():
                session_file.unlink()
                log_event(f"Cleaned up session data for {session_id}")
        except Exception as e:
            log_event(f"Error cleaning up session data: {str(e)}")


def main():
    """Main entry point for SessionEnd hook"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    transcript_path = input_data.get('transcript_path', '')
    cwd = input_data.get('cwd', '')
    reason = input_data.get('reason', 'unknown')

    log_event(f"SessionEnd triggered for {session_id}")

    logger = SessionDataLogger()
    logger.process_session(session_id, transcript_path, cwd, reason)

    safe_exit(0)


if __name__ == "__main__":
    main()
