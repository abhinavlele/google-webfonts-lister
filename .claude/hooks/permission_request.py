"""
PermissionRequest Hook - Track permission patterns and security interactions
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit


def main():
    """Track permission requests"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    tool_name = input_data.get('tool_name', 'unknown')
    reason = input_data.get('reason', '')
    tool_input = input_data.get('tool_input', {})

    log_event(f"Permission requested for {tool_name} in session: {session_id}")

    # Extract operation details for actionable reporting
    operation_details = extract_operation_details(tool_name, tool_input, reason)
    risk_level = assess_risk_level(tool_name, reason, tool_input)

    # Analyze permission request
    permission_analysis = {
        'tool_name': tool_name,
        'reason': reason,
        'risk_level': risk_level,
        'permission_type': classify_permission_type(tool_name, reason),
        'operation_details': operation_details,
        'risk_factors': identify_risk_factors(tool_name, tool_input, reason)
    }

    tracker = SessionTracker()
    tracker.add_event(session_id, 'permission_request', permission_analysis)

    safe_exit(0)


def extract_operation_details(tool_name: str, tool_input: dict, reason: str) -> dict:
    """Extract specific operation details for actionable reporting"""
    details = {
        'summary': '',
        'target': '',
        'action': ''
    }

    if tool_name == 'Bash':
        command = tool_input.get('command', '')
        details['summary'] = f"Command: {command[:200]}{'...' if len(command) > 200 else ''}"
        details['target'] = extract_command_target(command)
        details['action'] = extract_command_action(command)
    elif tool_name == 'Write':
        file_path = tool_input.get('file_path', '')
        content_preview = tool_input.get('content', '')[:100]
        details['summary'] = f"Write to: {file_path}"
        details['target'] = file_path
        details['action'] = 'create/overwrite file'
        details['content_preview'] = f"{content_preview}..." if len(tool_input.get('content', '')) > 100 else content_preview
    elif tool_name == 'Edit':
        file_path = tool_input.get('file_path', '')
        old_string = tool_input.get('old_string', '')[:80]
        details['summary'] = f"Edit: {file_path}"
        details['target'] = file_path
        details['action'] = 'modify file'
        details['old_string_preview'] = f"{old_string}..." if len(tool_input.get('old_string', '')) > 80 else old_string
    elif tool_name == 'Task':
        prompt = tool_input.get('prompt', '')[:150]
        agent_type = tool_input.get('subagent_type', 'unknown')
        details['summary'] = f"Agent: {agent_type}"
        details['target'] = agent_type
        details['action'] = 'spawn sub-agent'
        details['prompt_preview'] = f"{prompt}..." if len(tool_input.get('prompt', '')) > 150 else prompt
    elif tool_name in ['Read', 'Glob', 'Grep']:
        file_path = tool_input.get('file_path', tool_input.get('path', ''))
        pattern = tool_input.get('pattern', '')
        details['summary'] = f"{tool_name}: {file_path or pattern}"
        details['target'] = file_path or pattern
        details['action'] = 'read/search'
    else:
        details['summary'] = f"{tool_name}: {reason[:100]}"
        details['target'] = str(tool_input)[:100] if tool_input else reason[:100]
        details['action'] = tool_name.lower()

    return details


def extract_command_target(command: str) -> str:
    """Extract the target (file/path/resource) from a bash command"""
    import re
    # Common patterns for targets
    patterns = [
        r'(?:rm|delete|remove)\s+(?:-[rf]+\s+)?([^\s;|&]+)',  # rm commands
        r'(?:chmod|chown)\s+[^\s]+\s+([^\s;|&]+)',  # permission commands
        r'(?:mv|cp)\s+[^\s]+\s+([^\s;|&]+)',  # move/copy
        r'(?:git\s+push|git\s+pull|git\s+clone)\s+([^\s;|&]+)',  # git remote ops
        r'(?:curl|wget)\s+[^\s]*\s*([^\s;|&]+)',  # network requests
        r'(?:sudo)\s+(.+)',  # sudo commands
    ]

    for pattern in patterns:
        match = re.search(pattern, command, re.IGNORECASE)
        if match:
            return match.group(1)

    # Fallback: first path-like argument
    path_match = re.search(r'(/[^\s;|&]+|\.{1,2}/[^\s;|&]+)', command)
    if path_match:
        return path_match.group(1)

    return command.split()[0] if command.split() else command


def extract_command_action(command: str) -> str:
    """Extract the action type from a bash command"""
    command_lower = command.lower().strip()

    action_keywords = {
        'delete': ['rm ', 'rm -', 'rmdir', 'delete', 'unlink'],
        'modify_permissions': ['chmod', 'chown', 'chgrp'],
        'system_admin': ['sudo', 'su ', 'systemctl', 'service '],
        'network': ['curl', 'wget', 'ssh', 'scp', 'rsync'],
        'git_remote': ['git push', 'git pull', 'git clone', 'git remote'],
        'package_install': ['npm install', 'pip install', 'apt install', 'brew install', 'gem install'],
        'process_control': ['kill', 'pkill', 'killall'],
        'disk_operations': ['dd ', 'mkfs', 'mount', 'umount', 'fdisk'],
    }

    for action, keywords in action_keywords.items():
        if any(kw in command_lower for kw in keywords):
            return action

    return 'execute'


def identify_risk_factors(tool_name: str, tool_input: dict, reason: str) -> list:
    """Identify specific risk factors for this operation"""
    risk_factors = []
    reason_lower = reason.lower()

    if tool_name == 'Bash':
        command = tool_input.get('command', '').lower()
        if 'sudo' in command:
            risk_factors.append('elevated privileges (sudo)')
        if 'rm ' in command or 'rm -' in command:
            if '-rf' in command or '-r' in command:
                risk_factors.append('recursive deletion')
            else:
                risk_factors.append('file deletion')
        if 'chmod' in command:
            risk_factors.append('permission modification')
        if any(net in command for net in ['curl', 'wget', 'ssh', 'nc ']):
            risk_factors.append('network access')
        if 'git push' in command:
            if '--force' in command or '-f' in command:
                risk_factors.append('force push to remote')
            else:
                risk_factors.append('push to remote repository')
        if '>' in command or '>>' in command:
            risk_factors.append('file redirection/overwrite')
        if 'kill' in command:
            risk_factors.append('process termination')
        if any(pkg in command for pkg in ['npm install', 'pip install', 'gem install']):
            risk_factors.append('package installation')

    elif tool_name == 'Write':
        file_path = tool_input.get('file_path', '').lower()
        if any(sensitive in file_path for sensitive in ['.env', 'credentials', 'secret', 'password', 'key', '.pem']):
            risk_factors.append('sensitive file modification')
        if any(config in file_path for config in ['/etc/', 'config/', '.conf', '.yaml', '.json']):
            risk_factors.append('configuration file')

    elif tool_name == 'Edit':
        file_path = tool_input.get('file_path', '').lower()
        if any(sensitive in file_path for sensitive in ['.env', 'credentials', 'secret', 'password']):
            risk_factors.append('sensitive file edit')

    # Generic risk factors from reason
    if any(kw in reason_lower for kw in ['delete', 'remove', 'destroy']):
        risk_factors.append('destructive operation')
    if any(kw in reason_lower for kw in ['production', 'prod', 'live']):
        risk_factors.append('production environment')

    return risk_factors if risk_factors else ['standard operation']


def assess_risk_level(tool_name: str, reason: str, tool_input: dict = None) -> str:
    """Assess the risk level of the permission request"""
    tool_input = tool_input or {}
    reason_lower = reason.lower()

    # Critical risk - destructive or system-level operations
    critical_keywords = ['rm -rf', 'sudo rm', 'drop database', 'truncate', 'format', 'dd if=']
    if tool_name == 'Bash':
        command = tool_input.get('command', '').lower()
        if any(kw in command for kw in critical_keywords):
            return 'critical'
        if 'sudo' in command and any(kw in command for kw in ['rm', 'chmod 777', 'chown', 'kill -9']):
            return 'critical'

    # High risk - file modifications, deletions, system changes
    high_risk_tools = ['Bash', 'Write', 'Edit']
    high_risk_keywords = ['delete', 'remove', 'rm ', 'sudo', 'chmod', 'system', 'force', 'production']

    if tool_name == 'Bash':
        command = tool_input.get('command', '').lower()
        if any(kw in command for kw in ['rm ', 'rm -', 'chmod', 'chown', 'git push', 'kill']):
            return 'high'
    if tool_name == 'Write':
        file_path = tool_input.get('file_path', '').lower()
        if any(s in file_path for s in ['.env', 'credential', 'secret', 'password', '/etc/', '.pem', '.key']):
            return 'high'

    if tool_name in high_risk_tools or any(keyword in reason_lower for keyword in high_risk_keywords):
        return 'high'

    # Medium risk - sub-agents, general modifications
    medium_risk_tools = ['Task', 'TodoWrite']
    medium_risk_keywords = ['write', 'edit', 'modify', 'create', 'install']

    if tool_name in medium_risk_tools or any(keyword in reason_lower for keyword in medium_risk_keywords):
        return 'medium'

    return 'low'


def classify_permission_type(tool_name: str, reason: str) -> str:
    """Classify the type of permission being requested"""
    reason_lower = reason.lower()

    if 'file' in reason_lower or tool_name in ['Read', 'Write', 'Edit']:
        return 'file_access'
    elif 'command' in reason_lower or tool_name == 'Bash':
        return 'command_execution'
    elif 'network' in reason_lower or 'web' in reason_lower:
        return 'network_access'
    elif 'agent' in reason_lower or tool_name == 'Task':
        return 'agent_execution'
    else:
        return 'other'


if __name__ == "__main__":
    main()