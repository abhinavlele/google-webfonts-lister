"""
PreCompact Hook - Track context management with enhanced metrics
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit


def estimate_token_usage(context_length):
    """Estimate token count from context length"""
    # Rough estimation: ~4 characters per token
    estimated_tokens = context_length / 4
    
    # Categorize token usage
    if estimated_tokens > 100000:
        token_category = 'very_high'
        efficiency = 'may_need_optimization'
    elif estimated_tokens > 50000:
        token_category = 'high'
        efficiency = 'active_session'
    elif estimated_tokens > 25000:
        token_category = 'medium'
        efficiency = 'normal'
    else:
        token_category = 'low'
        efficiency = 'efficient'
    
    return {
        'estimated_tokens': int(estimated_tokens),
        'token_category': token_category,
        'efficiency_assessment': efficiency
    }


def extract_key_topics(session_data):
    """Extract key topics being discussed from session events"""
    events = session_data.get('events', [])
    
    topics = {
        'technical_domains': [],
        'request_types': [],
        'tools_used': [],
        'files_modified': set()
    }
    
    # Analyze prompts for domains
    prompt_events = [e for e in events if e.get('type') == 'user_prompt_submit']
    for event in prompt_events:
        analysis = event.get('data', {}).get('prompt_analysis', {})
        domains = analysis.get('technical_domains', [])
        topics['technical_domains'].extend(domains)
        
        req_type = analysis.get('request_type', '')
        if req_type:
            topics['request_types'].append(req_type)
    
    # Analyze tool usage
    tool_usage = session_data.get('tool_usage', {})
    topics['tools_used'] = list(tool_usage.keys())
    
    # Extract files from tool events
    tool_events = [e for e in events if e.get('type') in ['pre_tool_use', 'post_tool_use']]
    for event in tool_events:
        data = event.get('data', {})
        
        # Extract file paths from path_context or side_effects
        path_context = data.get('path_context', {})
        if path_context.get('paths'):
            topics['files_modified'].update(path_context['paths'])
        
        side_effects = data.get('side_effects', [])
        for effect in side_effects:
            if effect.get('target'):
                topics['files_modified'].add(effect['target'])
    
    # Deduplicate and summarize
    from collections import Counter
    
    domain_counts = Counter(topics['technical_domains'])
    request_counts = Counter(topics['request_types'])
    
    return {
        'primary_domains': [d for d, _ in domain_counts.most_common(3)],
        'primary_request_types': [r for r, _ in request_counts.most_common(3)],
        'tools_used_count': len(topics['tools_used']),
        'files_modified_count': len(topics['files_modified']),
        'unique_domains': len(set(topics['technical_domains'])),
        'domain_diversity': len(set(topics['technical_domains'])) / max(len(topics['technical_domains']), 1)
    }


def analyze_compaction_context(session_data):
    """Analyze the context at time of compaction"""
    events = session_data.get('events', [])
    
    context_info = {
        'total_events': len(events),
        'event_types': {},
        'recent_activity': 'unknown',
        'conversation_depth': 'unknown'
    }
    
    # Count event types
    from collections import Counter
    event_types = Counter(e.get('type', 'unknown') for e in events)
    context_info['event_types'] = dict(event_types.most_common(5))
    
    # Analyze recent activity
    if len(events) > 10:
        recent_events = events[-10:]
        recent_tool_uses = len([e for e in recent_events if e.get('type') == 'pre_tool_use'])
        
        if recent_tool_uses > 5:
            context_info['recent_activity'] = 'very_active'
        elif recent_tool_uses > 2:
            context_info['recent_activity'] = 'active'
        else:
            context_info['recent_activity'] = 'moderate'
    
    # Determine conversation depth
    prompt_count = event_types.get('user_prompt_submit', 0)
    if prompt_count > 20:
        context_info['conversation_depth'] = 'deep'
    elif prompt_count > 10:
        context_info['conversation_depth'] = 'medium'
    else:
        context_info['conversation_depth'] = 'shallow'
    
    return context_info


def main():
    """Track context compaction events"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    context_length = input_data.get('context_length', 0)
    reason = input_data.get('reason', 'length_limit')

    log_event(f"Context compaction triggered: {reason} in session: {session_id}")

    # Load session data for analysis
    tracker = SessionTracker()
    session_data = tracker.load_session_data(session_id)
    
    # Enhanced analysis
    token_metrics = estimate_token_usage(context_length)
    key_topics = extract_key_topics(session_data)
    compaction_context = analyze_compaction_context(session_data)
    
    # Analyze compaction event
    compaction_analysis = {
        'context_length': context_length,
        'reason': reason,
        'complexity_level': assess_conversation_complexity(context_length),
        'compaction_trigger': classify_compaction_trigger(reason),
        'token_metrics': token_metrics,
        'key_topics': key_topics,
        'compaction_context': compaction_context
    }

    tracker.add_event(session_id, 'pre_compact', compaction_analysis)
    
    # Log summary
    log_event(f"Compaction analysis - Tokens: ~{token_metrics['estimated_tokens']}, "
              f"Events: {compaction_context['total_events']}, "
              f"Domains: {', '.join(key_topics['primary_domains'][:2])}")

    safe_exit(0)


def assess_conversation_complexity(context_length: int) -> str:
    """Assess conversation complexity based on context length"""
    if context_length > 50000:
        return 'very_high'
    elif context_length > 30000:
        return 'high'
    elif context_length > 15000:
        return 'medium'
    else:
        return 'low'


def classify_compaction_trigger(reason: str) -> str:
    """Classify why compaction was triggered"""
    reason_lower = reason.lower()

    if 'length' in reason_lower or 'limit' in reason_lower:
        return 'length_limit'
    elif 'memory' in reason_lower:
        return 'memory_pressure'
    elif 'performance' in reason_lower:
        return 'performance'
    else:
        return 'other'


if __name__ == "__main__":
    main()
