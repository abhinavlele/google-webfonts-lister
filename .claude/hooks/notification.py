"""
Notification Hook - Track system feedback and notifications with full content
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit


def analyze_notification_content(message):
    """Analyze notification message content in detail"""
    analysis = {
        'message_length': len(message),
        'has_urls': False,
        'has_code': False,
        'has_paths': False,
        'keywords': [],
        'actionable': False
    }
    
    message_lower = message.lower()
    
    # Detect URLs
    import re
    url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
    if re.search(url_pattern, message):
        analysis['has_urls'] = True
    
    # Detect code blocks or inline code
    if '```' in message or '`' in message:
        analysis['has_code'] = True
    
    # Detect file paths
    path_pattern = r'(/[^\s]+|[A-Za-z]:\\[^\s]+|\./[^\s]+)'
    if re.search(path_pattern, message):
        analysis['has_paths'] = True
    
    # Extract keywords
    keyword_categories = {
        'error': ['error', 'exception', 'fail', 'crash'],
        'warning': ['warning', 'warn', 'caution', 'deprecated'],
        'success': ['success', 'complete', 'done', 'finish'],
        'action': ['please', 'should', 'must', 'need', 'required'],
        'info': ['info', 'note', 'tip', 'fyi']
    }
    
    found_keywords = []
    for category, keywords in keyword_categories.items():
        if any(kw in message_lower for kw in keywords):
            found_keywords.append(category)
    
    analysis['keywords'] = found_keywords
    
    # Detect if actionable
    actionable_indicators = [
        'please', 'should', 'must', 'need to', 'required',
        'action', 'fix', 'update', 'change'
    ]
    analysis['actionable'] = any(ind in message_lower for ind in actionable_indicators)
    
    return analysis


def extract_action_items(message):
    """Extract potential action items from notification"""
    actions = []
    message_lower = message.lower()
    
    # Common action patterns
    action_patterns = [
        (r'please (.*?)[.\n]', 'request'),
        (r'you should (.*?)[.\n]', 'suggestion'),
        (r'you must (.*?)[.\n]', 'requirement'),
        (r'fix (.*?)[.\n]', 'fix_needed'),
        (r'update (.*?)[.\n]', 'update_needed')
    ]
    
    import re
    for pattern, action_type in action_patterns:
        matches = re.findall(pattern, message_lower, re.IGNORECASE)
        for match in matches:
            actions.append({
                'type': action_type,
                'description': match.strip()[:100]  # Limit length
            })
    
    return actions


def determine_notification_impact(message, notification_type, severity):
    """Determine the potential impact of this notification"""
    impact = {
        'level': 'low',
        'requires_user_action': False,
        'affects_workflow': False,
        'description': ''
    }
    
    # High impact indicators
    if notification_type in ['error', 'critical']:
        impact['level'] = 'high'
        impact['requires_user_action'] = True
        impact['affects_workflow'] = True
        impact['description'] = 'Critical issue requiring immediate attention'
    elif severity == 'high':
        impact['level'] = 'high'
        impact['requires_user_action'] = True
        impact['description'] = 'Important issue that may block progress'
    elif notification_type == 'warning':
        impact['level'] = 'medium'
        impact['affects_workflow'] = True
        impact['description'] = 'Potential issue to be aware of'
    else:
        impact['level'] = 'low'
        impact['description'] = 'Informational notification'
    
    message_lower = message.lower()
    
    # Refine based on message content
    if any(word in message_lower for word in ['blocking', 'blocked', 'cannot', 'unable']):
        impact['level'] = 'high'
        impact['requires_user_action'] = True
        impact['affects_workflow'] = True
    elif any(word in message_lower for word in ['permission', 'access denied', 'forbidden']):
        impact['level'] = 'high'
        impact['requires_user_action'] = True
    
    return impact


def main():
    """Track system notifications"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    message = input_data.get('message', '')
    notification_type = input_data.get('type', 'info')

    log_event(f"Notification: {notification_type} in session: {session_id}")

    # Enhanced analysis
    content_analysis = analyze_notification_content(message)
    action_items = extract_action_items(message)
    severity = classify_severity(message, notification_type)
    impact = determine_notification_impact(message, notification_type, severity)
    
    # Analyze notification
    notification_analysis = {
        'type': notification_type,
        'message': message,  # Store full message
        'message_preview': message[:200],  # Preview for quick reference
        'message_length': len(message),
        'severity': severity,
        'category': classify_notification_category(message),
        'content_analysis': content_analysis,
        'action_items': action_items,
        'impact': impact,
        'timestamp': input_data.get('timestamp', '')
    }

    tracker = SessionTracker()
    tracker.add_event(session_id, 'notification', notification_analysis)
    
    # Log summary
    log_event(f"Notification analyzed - Severity: {severity}, "
              f"Impact: {impact['level']}, "
              f"Actions: {len(action_items)}")

    safe_exit(0)


def classify_severity(message: str, notification_type: str) -> str:
    """Classify notification severity"""
    message_lower = message.lower()

    if notification_type in ['error', 'critical'] or any(word in message_lower for word in ['error', 'failed', 'critical']):
        return 'high'
    elif notification_type in ['warning', 'warn'] or any(word in message_lower for word in ['warning', 'warn', 'caution']):
        return 'medium'
    else:
        return 'low'


def classify_notification_category(message: str) -> str:
    """Classify notification category"""
    message_lower = message.lower()

    if any(word in message_lower for word in ['permission', 'access', 'auth']):
        return 'security'
    elif any(word in message_lower for word in ['tool', 'command', 'execution']):
        return 'tool_execution'
    elif any(word in message_lower for word in ['file', 'directory', 'path']):
        return 'file_system'
    elif any(word in message_lower for word in ['network', 'connection', 'timeout']):
        return 'network'
    elif any(word in message_lower for word in ['memory', 'cpu', 'resource']):
        return 'resource'
    elif any(word in message_lower for word in ['git', 'commit', 'branch']):
        return 'version_control'
    else:
        return 'general'


if __name__ == "__main__":
    main()
