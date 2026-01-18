"""
Stop Hook - Track assistant response patterns, completion metrics, and Ralph Wiggum loop control.

The Ralph Wiggum loop creates iterative self-referential development:
- Intercepts Claude's exit attempts
- Re-feeds the same prompt if completion criteria not met
- Claude sees its previous work via modified files + git history
- Continues until completion promise found or max iterations reached

Reference: https://ghuntley.com/ralph/
"""
import json
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit
from ralph_state import RalphState


def gather_task_completion_metrics(session_data):
    """Calculate metrics about task completion"""
    events = session_data.get('events', [])
    tool_usage = session_data.get('tool_usage', {})

    metrics = {
        'total_tools_used': len(tool_usage),
        'total_tool_executions': sum(stats.get('count', 0) for stats in tool_usage.values()),
        'successful_tool_executions': 0,
        'failed_tool_executions': 0,
        'total_events': len(events),
        'user_prompts': len([e for e in events if e.get('type') == 'user_prompt_submit']),
        'permission_requests': len([e for e in events if e.get('type') == 'permission_request']),
        'errors_encountered': len([e for e in events if e.get('type') == 'post_tool_use' and not e.get('data', {}).get('success')]),
        'subagent_invocations': len([e for e in events if e.get('type') == 'subagent_stop']),
        'context_compactions': len([e for e in events if e.get('type') == 'pre_compact'])
    }

    # Calculate tool success counts
    for tool_name, stats in tool_usage.items():
        count = stats.get('count', 0)
        success_rate = stats.get('success_rate', 100)
        successes = int((success_rate / 100) * count)
        metrics['successful_tool_executions'] += successes
        metrics['failed_tool_executions'] += (count - successes)

    # Overall success rate
    total_tool_ops = metrics['successful_tool_executions'] + metrics['failed_tool_executions']
    if total_tool_ops > 0:
        metrics['overall_success_rate'] = (metrics['successful_tool_executions'] / total_tool_ops) * 100
    else:
        metrics['overall_success_rate'] = 100.0

    return metrics


def gather_conversation_statistics(session_data):
    """Gather statistics about the conversation flow"""
    events = session_data.get('events', [])

    stats = {
        'duration_seconds': 0,
        'interaction_rhythm': 'unknown',
        'complexity_trend': 'stable',
        'primary_request_types': [],
        'tools_by_category': {}
    }

    # Calculate duration
    if len(events) >= 2:
        try:
            from datetime import datetime
            start_time = datetime.fromisoformat(events[0]['timestamp'])
            end_time = datetime.fromisoformat(events[-1]['timestamp'])
            stats['duration_seconds'] = (end_time - start_time).total_seconds()
        except Exception:
            pass

    # Analyze interaction rhythm
    prompt_events = [e for e in events if e.get('type') == 'user_prompt_submit']
    if len(prompt_events) > 1:
        try:
            from datetime import datetime
            intervals = []
            for i in range(1, len(prompt_events)):
                t1 = datetime.fromisoformat(prompt_events[i-1]['timestamp'])
                t2 = datetime.fromisoformat(prompt_events[i]['timestamp'])
                intervals.append((t2 - t1).total_seconds())

            avg_interval = sum(intervals) / len(intervals)
            if avg_interval < 30:
                stats['interaction_rhythm'] = 'rapid'
            elif avg_interval < 120:
                stats['interaction_rhythm'] = 'normal'
            else:
                stats['interaction_rhythm'] = 'slow'
        except Exception:
            pass

    # Analyze request types
    request_types = []
    for e in prompt_events:
        req_type = e.get('data', {}).get('prompt_analysis', {}).get('request_type', 'other')
        request_types.append(req_type)

    if request_types:
        from collections import Counter
        type_counts = Counter(request_types)
        stats['primary_request_types'] = [
            {'type': t, 'count': c}
            for t, c in type_counts.most_common(3)
        ]

    # Categorize tools used
    tool_usage = session_data.get('tool_usage', {})
    categories = {
        'file_operation': ['Read', 'Write', 'Edit', 'Glob', 'MultiEdit'],
        'execution': ['Bash', 'Task'],
        'search': ['Grep', 'WebFetch', 'WebSearch'],
        'management': ['TodoWrite', 'AskUserQuestion']
    }

    for category, tools in categories.items():
        count = sum(tool_usage.get(tool, {}).get('count', 0) for tool in tools)
        if count > 0:
            stats['tools_by_category'][category] = count

    return stats


def determine_final_status(session_data, reason):
    """Determine the final status of the session"""
    metrics = gather_task_completion_metrics(session_data)

    # Analyze final state
    success_rate = metrics['overall_success_rate']
    has_errors = metrics['errors_encountered'] > 0

    if reason.lower() in ['complete', 'finished', 'end_turn_input']:
        if success_rate > 90 and not has_errors:
            return 'completed_successfully'
        elif success_rate > 70:
            return 'completed_with_issues'
        else:
            return 'completed_with_errors'
    elif 'interrupt' in reason.lower():
        return 'interrupted_by_user'
    elif 'timeout' in reason.lower():
        return 'timeout'
    elif 'error' in reason.lower():
        return 'error_termination'
    else:
        return 'unknown'


def classify_completion_type(reason: str) -> str:
    """Classify how the response completed"""
    reason_lower = reason.lower()

    if 'complete' in reason_lower or 'finish' in reason_lower:
        return 'natural_completion'
    elif 'interrupt' in reason_lower or 'stop' in reason_lower:
        return 'interrupted'
    elif 'timeout' in reason_lower:
        return 'timeout'
    elif 'error' in reason_lower:
        return 'error_termination'
    else:
        return 'unknown'


def check_ralph_loop(input_data: dict) -> tuple[bool, str]:
    """
    Check if Ralph Wiggum loop should continue.

    Args:
        input_data: The hook input data containing transcript info

    Returns:
        Tuple of (should_continue: bool, reason: str)
    """
    ralph = RalphState()

    if not ralph.is_active():
        return False, "no_active_loop"

    # Check if we're already in a stop hook continuation (prevent infinite loops)
    if input_data.get('stop_hook_active', False):
        log_event("[Ralph] Stop hook already active, allowing stop to prevent infinite loop")
        return False, "stop_hook_already_active"

    state = ralph.get_state()
    current_iteration = state.get('current_iteration', 0)
    max_iterations = state.get('max_iterations')
    completion_promise = state.get('completion_promise')

    log_event(f"[Ralph] Active loop - iteration {current_iteration}, "
              f"max={max_iterations}, promise='{completion_promise}'")

    # Extract Claude's output from transcript to check for completion promise
    transcript = input_data.get('transcript', [])
    claude_output = ""
    for entry in reversed(transcript):
        if entry.get('type') == 'assistant':
            # Get the last assistant message
            content = entry.get('content', '')
            if isinstance(content, list):
                # Handle structured content
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'text':
                        claude_output += item.get('text', '')
            else:
                claude_output = str(content)
            break

    # Check if completion promise is found
    # Support both raw promise and promise wrapped in <promise></promise> tags
    if completion_promise:
        promise_found = False
        # Check for raw promise
        if completion_promise in claude_output:
            promise_found = True
        # Check for promise wrapped in tags: <promise>PROMISE</promise>
        elif f"<promise>{completion_promise}</promise>" in claude_output:
            promise_found = True

        if promise_found:
            final_state = ralph.complete_loop()
            log_event(f"[Ralph] Completion promise '{completion_promise}' found! "
                      f"Loop completed after {final_state.get('current_iteration', 0)} iterations")
            return False, "completion_promise_found"

    # Check max iterations
    if max_iterations and current_iteration >= max_iterations:
        final_state = ralph.cancel_loop("max_iterations_reached")
        log_event(f"[Ralph] Max iterations ({max_iterations}) reached. Loop cancelled.")
        return False, "max_iterations_reached"

    # Continue the loop
    ralph.increment_iteration()
    updated_state = ralph.get_state()
    log_event(f"[Ralph] Continuing loop - now at iteration {updated_state.get('current_iteration')}")

    return True, ralph.get_prompt()


def output_ralph_continuation(prompt: str) -> None:
    """
    Output the JSON to stderr to make Claude continue with the Ralph prompt.

    The Stop hook uses exit code 2 and JSON on stderr to signal continuation.
    """
    state = RalphState().get_state()
    iteration = state.get('current_iteration', 1)

    continuation_json = {
        "decision": "block",
        "reason": f"[Ralph Loop - Iteration {iteration}] Continue working on the task. "
                  f"Your previous work is visible in the modified files and git history. "
                  f"Original task:\n\n{prompt}"
    }

    # Write to stderr as required by Claude Code
    print(json.dumps(continuation_json), file=sys.stderr)


def main():
    """Track when assistant stops responding and handle Ralph Wiggum loop"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    reason = input_data.get('reason', 'completed')

    log_event(f"Assistant stopped: {reason} in session: {session_id}")

    # Check Ralph Wiggum loop FIRST
    should_continue, ralph_reason = check_ralph_loop(input_data)

    if should_continue:
        log_event(f"[Ralph] Blocking stop, continuing with prompt")
        output_ralph_continuation(ralph_reason)
        # Exit with code 2 to signal continuation
        sys.exit(2)

    # Normal stop processing continues below...

    # Load session data for analysis
    tracker = SessionTracker()
    session_data = tracker.load_session_data(session_id)

    # Gather comprehensive metrics
    task_metrics = gather_task_completion_metrics(session_data)
    conversation_stats = gather_conversation_statistics(session_data)
    final_status = determine_final_status(session_data, reason)

    # Include Ralph loop info if it just completed
    ralph_info = {}
    if ralph_reason in ["completion_promise_found", "max_iterations_reached"]:
        ralph_info = {
            "ralph_loop_ended": True,
            "ralph_end_reason": ralph_reason
        }

    # Analyze stop event
    stop_analysis = {
        'reason': reason,
        'completion_type': classify_completion_type(reason),
        'final_status': final_status,
        'task_metrics': task_metrics,
        'conversation_stats': conversation_stats,
        **ralph_info
    }

    tracker.add_event(session_id, 'stop', stop_analysis)

    # Log summary
    log_event(f"Session metrics - Tools: {task_metrics['total_tool_executions']}, "
              f"Success rate: {task_metrics['overall_success_rate']:.1f}%, "
              f"Duration: {conversation_stats['duration_seconds']:.0f}s")

    safe_exit(0)


if __name__ == "__main__":
    main()
