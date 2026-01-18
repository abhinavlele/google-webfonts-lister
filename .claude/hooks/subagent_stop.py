"""
SubagentStop Hook - Track subagent usage patterns, duration, and tool usage
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit


def calculate_agent_duration(session_id, agent_type):
    """Calculate how long the agent ran"""
    tracker = SessionTracker()
    session_data = tracker.load_session_data(session_id)
    events = session_data.get('events', [])
    
    # Find the most recent subagent start for this agent type
    # Note: This is a simplified approach - would need proper agent tracking
    # for precise duration calculation
    duration_seconds = 0.0
    
    try:
        from datetime import datetime
        # Find recent tool executions that might belong to this agent
        # Look back through recent events
        recent_events = events[-50:] if len(events) > 50 else events
        
        if len(recent_events) >= 2:
            # Estimate duration from recent activity window
            start_time = datetime.fromisoformat(recent_events[0]['timestamp'])
            end_time = datetime.fromisoformat(recent_events[-1]['timestamp'])
            duration_seconds = (end_time - start_time).total_seconds()
    except Exception:
        pass
    
    return duration_seconds


def summarize_agent_tool_usage(session_id, agent_type):
    """Summarize tool usage within agent's execution window"""
    tracker = SessionTracker()
    session_data = tracker.load_session_data(session_id)
    tool_usage = session_data.get('tool_usage', {})
    
    # Get recent tool usage stats
    # This is a simplified version - ideally we'd track tools per agent
    summary = {
        'total_tools_available': len(tool_usage),
        'most_used_tool': None,
        'least_successful_tool': None,
        'tool_diversity': 0
    }
    
    if tool_usage:
        # Find most used tool
        most_used = max(tool_usage.items(), key=lambda x: x[1].get('count', 0))
        summary['most_used_tool'] = {
            'name': most_used[0],
            'count': most_used[1].get('count', 0)
        }
        
        # Find least successful tool (with minimum usage threshold)
        tools_with_failures = {
            name: stats for name, stats in tool_usage.items()
            if stats.get('count', 0) >= 2 and stats.get('success_rate', 100) < 100
        }
        if tools_with_failures:
            least_successful = min(
                tools_with_failures.items(),
                key=lambda x: x[1].get('success_rate', 100)
            )
            summary['least_successful_tool'] = {
                'name': least_successful[0],
                'success_rate': least_successful[1].get('success_rate', 0)
            }
        
        # Calculate tool diversity (how many different tools used)
        summary['tool_diversity'] = len([
            name for name, stats in tool_usage.items()
            if stats.get('count', 0) > 0
        ])
    
    return summary


def calculate_output_metrics(session_id, agent_type):
    """Calculate metrics about agent output"""
    tracker = SessionTracker()
    session_data = tracker.load_session_data(session_id)
    events = session_data.get('events', [])
    
    metrics = {
        'events_generated': 0,
        'tools_executed': 0,
        'errors_encountered': 0,
        'estimated_output_size': 0
    }
    
    # Count recent events (simplified - would need proper agent tracking)
    recent_events = events[-20:] if len(events) > 20 else events
    
    metrics['events_generated'] = len(recent_events)
    metrics['tools_executed'] = len([
        e for e in recent_events 
        if e.get('type') == 'post_tool_use'
    ])
    metrics['errors_encountered'] = len([
        e for e in recent_events 
        if e.get('type') == 'post_tool_use' and not e.get('data', {}).get('success')
    ])
    
    # Estimate output size based on event data
    import json
    try:
        for event in recent_events:
            metrics['estimated_output_size'] += len(json.dumps(event.get('data', {})))
    except Exception:
        pass
    
    return metrics


def main():
    """Track subagent task completion"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    agent_type = input_data.get('agent_type', 'unknown')
    success = input_data.get('success', True)
    task_description = input_data.get('task_description', '')

    log_event(f"Subagent {agent_type} {'completed' if success else 'failed'} in session: {session_id}")

    # Gather comprehensive agent metrics
    duration = calculate_agent_duration(session_id, agent_type)
    tool_summary = summarize_agent_tool_usage(session_id, agent_type)
    output_metrics = calculate_output_metrics(session_id, agent_type)
    
    # Analyze subagent completion
    subagent_analysis = {
        'agent_type': agent_type,
        'success': success,
        'task_complexity': assess_task_complexity(task_description),
        'agent_category': classify_agent_category(agent_type),
        'duration_seconds': duration,
        'tool_usage_summary': tool_summary,
        'output_metrics': output_metrics,
        'task_description_length': len(task_description),
        'task_description_preview': task_description[:200] if task_description else ''
    }

    tracker = SessionTracker()
    tracker.add_event(session_id, 'subagent_stop', subagent_analysis)
    
    # Log summary
    log_event(f"Agent {agent_type} completed - Duration: {duration:.1f}s, "
              f"Tools: {output_metrics['tools_executed']}, "
              f"Success: {success}")

    safe_exit(0)


def assess_task_complexity(task_description: str) -> str:
    """Assess the complexity of the task"""
    desc_lower = task_description.lower()
    word_count = len(task_description.split())

    complex_keywords = ['implement', 'design', 'architect', 'refactor', 'analyze', 'comprehensive']
    simple_keywords = ['read', 'check', 'find', 'list', 'show']

    if word_count > 50 or any(keyword in desc_lower for keyword in complex_keywords):
        return 'high'
    elif word_count > 20 or any(keyword in desc_lower for keyword in simple_keywords):
        return 'medium'
    else:
        return 'low'


def classify_agent_category(agent_type: str) -> str:
    """Classify the agent into functional categories"""
    engineering_agents = ['backend-architect', 'test-writer-fixer', 'git-worktree-expert', 'ruby-developer']
    security_agents = ['pentest-remediation-validator', 'security-auditor', 'infra-security-engineer']
    research_agents = ['trend-researcher', 'Explore']
    ci_agents = ['ci-fixer-parallel']
    design_agents = ['visual-storyteller']

    if agent_type in engineering_agents:
        return 'engineering'
    elif agent_type in security_agents:
        return 'security'
    elif agent_type in research_agents:
        return 'research'
    elif agent_type in ci_agents:
        return 'ci_cd'
    elif agent_type in design_agents:
        return 'design'
    else:
        return 'general'


if __name__ == "__main__":
    main()
