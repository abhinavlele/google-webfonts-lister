"""
PostToolUse Hook - Track tool execution results with enhanced analysis and auto-checks
"""
import sys
import os
import time
import subprocess
import json
from pathlib import Path
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit


def analyze_output_size(tool_output, tool_result):
    """Analyze the size and characteristics of tool output"""
    size_info = {
        'output_size_bytes': 0,
        'output_size_category': 'none',
        'has_output': False,
        'output_type': 'unknown'
    }
    
    # Calculate size from various output fields
    output_str = ''
    if tool_output:
        output_str = str(tool_output)
    elif tool_result:
        output_str = str(tool_result)
    
    if output_str:
        size_info['has_output'] = True
        size_info['output_size_bytes'] = len(output_str.encode('utf-8'))
        
        # Categorize size
        size_bytes = size_info['output_size_bytes']
        if size_bytes < 100:
            size_info['output_size_category'] = 'tiny'
        elif size_bytes < 1000:
            size_info['output_size_category'] = 'small'
        elif size_bytes < 10000:
            size_info['output_size_category'] = 'medium'
        elif size_bytes < 100000:
            size_info['output_size_category'] = 'large'
        else:
            size_info['output_size_category'] = 'very_large'
        
        # Detect output type
        if output_str.strip().startswith('{') or output_str.strip().startswith('['):
            size_info['output_type'] = 'json'
        elif '\n' in output_str and len(output_str.split('\n')) > 5:
            size_info['output_type'] = 'multiline_text'
        elif any(keyword in output_str.lower() for keyword in ['error', 'exception', 'traceback']):
            size_info['output_type'] = 'error_message'
        else:
            size_info['output_type'] = 'text'
    
    return size_info


def classify_result_type(tool_name, success, tool_output, error_message):
    """Classify the result in more detail"""
    if not success:
        return 'failure'
    
    result_classifications = []
    
    # Tool-specific classifications
    if tool_name == 'Read':
        result_classifications.append('file_read')
    elif tool_name == 'Write':
        result_classifications.append('file_written')
    elif tool_name == 'Edit':
        result_classifications.append('file_edited')
    elif tool_name == 'Bash':
        if tool_output:
            output_lower = str(tool_output).lower()
            if 'test' in output_lower or 'spec' in output_lower:
                result_classifications.append('test_execution')
            elif 'commit' in output_lower:
                result_classifications.append('git_commit')
            else:
                result_classifications.append('command_output')
        else:
            result_classifications.append('silent_success')
    elif tool_name in ['Glob', 'Grep']:
        result_classifications.append('search_results')
    
    # Success type
    if not tool_output or len(str(tool_output)) < 10:
        result_classifications.append('quiet_success')
    else:
        result_classifications.append('verbose_success')
    
    return result_classifications if result_classifications else ['success']


def detect_side_effects(tool_name, tool_input, tool_output, cwd):
    """Detect potential side effects from tool execution"""
    side_effects = []
    
    # File system side effects
    if tool_name == 'Write':
        file_path = tool_input.get('file_path', '')
        side_effects.append({
            'type': 'file_created',
            'target': file_path,
            'description': f"Created or overwrote file: {file_path}"
        })
    
    elif tool_name == 'Edit':
        file_path = tool_input.get('file_path', '')
        side_effects.append({
            'type': 'file_modified',
            'target': file_path,
            'description': f"Modified file: {file_path}"
        })
    
    elif tool_name == 'Bash':
        command = tool_input.get('command', '')
        command_lower = command.lower()
        
        # Git operations
        if 'git commit' in command_lower:
            side_effects.append({
                'type': 'git_commit',
                'target': cwd,
                'description': 'Created git commit'
            })
        if 'git push' in command_lower:
            side_effects.append({
                'type': 'git_push',
                'target': cwd,
                'description': 'Pushed changes to remote'
            })
        if 'git checkout' in command_lower or 'git switch' in command_lower:
            side_effects.append({
                'type': 'git_branch_change',
                'target': cwd,
                'description': 'Changed git branch'
            })
        
        # File operations in bash
        if any(op in command_lower for op in ['rm ', 'rm\t', 'mv ', 'cp ']):
            side_effects.append({
                'type': 'file_operation',
                'target': 'filesystem',
                'description': f'File system modification via: {command[:100]}'
            })
        
        # Package installations
        if any(pm in command_lower for pm in ['npm install', 'pip install', 'bundle install', 'gem install']):
            side_effects.append({
                'type': 'dependency_installation',
                'target': cwd,
                'description': 'Installed dependencies'
            })
        
        # Infrastructure changes
        if any(infra in command_lower for infra in ['terraform apply', 'kubectl apply', 'docker build']):
            side_effects.append({
                'type': 'infrastructure_change',
                'target': 'infrastructure',
                'description': f'Infrastructure modification: {command[:100]}'
            })
    
    return side_effects


def main():
    """Track tool execution results and run auto-checks"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    tool_name = input_data.get('tool_name', 'unknown')
    success = input_data.get('success', True)
    error_message = input_data.get('error_message', '')
    execution_time = input_data.get('execution_time_ms', 0)
    tool_output = input_data.get('tool_output', '')
    tool_result = input_data.get('tool_result', '')
    tool_input = input_data.get('tool_input', {})
    cwd = input_data.get('cwd', os.getcwd())

    # Auto-run quality checks for Ruby files
    if tool_name in ['Edit', 'Write'] and success:
        run_ruby_quality_checks(input_data)

    log_event(f"Post-tool use: {tool_name} {'succeeded' if success else 'failed'} in session: {session_id}")

    # Enhanced analysis
    output_analysis = analyze_output_size(tool_output, tool_result)
    result_classifications = classify_result_type(tool_name, success, tool_output, error_message)
    side_effects = detect_side_effects(tool_name, tool_input, tool_output, cwd)
    
    # Analyze tool execution results
    execution_analysis = {
        'tool_name': tool_name,
        'success': success,
        'execution_time_ms': execution_time,
        'has_error': bool(error_message),
        'error_type': classify_error_type(error_message) if error_message else None,
        'error_message_preview': error_message[:200] if error_message else None,
        'end_time': time.time(),
        'output_analysis': output_analysis,
        'result_classifications': result_classifications,
        'side_effects': side_effects,
        'side_effects_count': len(side_effects)
    }

    tracker = SessionTracker()
    data = tracker.load_session_data(session_id)

    # Update tool usage statistics
    if 'tool_usage' in data and tool_name in data['tool_usage']:
        tool_stats = data['tool_usage'][tool_name]

        # Update success rate
        total_uses = tool_stats['count']
        if success:
            current_successes = int(tool_stats['success_rate'] * (total_uses - 1) / 100) if total_uses > 1 else 0
            tool_stats['success_rate'] = ((current_successes + 1) / total_uses) * 100
        else:
            tool_stats['failures'] += 1
            current_successes = int(tool_stats['success_rate'] * (total_uses - 1) / 100) if total_uses > 1 else 0
            tool_stats['success_rate'] = (current_successes / total_uses) * 100

        # Update average duration
        current_avg = tool_stats['average_duration']
        if total_uses == 1:
            tool_stats['average_duration'] = execution_time
        else:
            tool_stats['average_duration'] = ((current_avg * (total_uses - 1)) + execution_time) / total_uses

        # Track error patterns
        if not success and error_message:
            if 'error_patterns' not in tool_stats:
                tool_stats['error_patterns'] = {}
            error_type = classify_error_type(error_message)
            if error_type not in tool_stats['error_patterns']:
                tool_stats['error_patterns'][error_type] = 0
            tool_stats['error_patterns'][error_type] += 1
        
        # Track output size patterns
        if 'output_sizes' not in tool_stats:
            tool_stats['output_sizes'] = []
        tool_stats['output_sizes'].append(output_analysis['output_size_bytes'])
        # Keep only last 20 sizes
        if len(tool_stats['output_sizes']) > 20:
            tool_stats['output_sizes'] = tool_stats['output_sizes'][-20:]

    tracker.save_session_data(session_id, data)
    tracker.add_event(session_id, 'post_tool_use', execution_analysis)

    safe_exit(0)


def run_ruby_quality_checks(input_data: dict):
    """Run rubocop automatically on Ruby files"""
    try:
        # Extract file path from tool input
        tool_input = input_data.get('tool_input', {})
        file_path = tool_input.get('file_path', '')

        if not file_path or not file_path.endswith('.rb'):
            return

        if not os.path.exists(file_path):
            return

        log_event(f"Running rubocop on {file_path}")

        # Check if we're in a project with Gemfile (has bundler)
        project_root = find_project_root(file_path)
        if project_root and os.path.exists(os.path.join(project_root, 'Gemfile')):
            # Use bundle exec rubocop
            cmd = ['bundle', 'exec', 'rubocop', '-a', file_path]
            cwd = project_root
        else:
            # Use system rubocop
            cmd = ['rubocop', '-a', file_path]
            cwd = os.path.dirname(file_path)

        # Run rubocop with timeout
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            log_event(f"Rubocop auto-fix completed for {file_path}")
        else:
            log_event(f"Rubocop found issues in {file_path}: {result.stdout.strip()}")

    except subprocess.TimeoutExpired:
        log_event("Rubocop timeout - file may need manual attention")
    except FileNotFoundError:
        log_event("Rubocop not installed - install with: gem install rubocop")
    except Exception as e:
        log_event(f"Rubocop error: {str(e)}")


def find_project_root(file_path: str) -> str:
    """Find project root by looking for Gemfile or git root"""
    current_dir = os.path.dirname(file_path)

    while current_dir and current_dir != '/':
        if any(os.path.exists(os.path.join(current_dir, marker))
               for marker in ['Gemfile', '.git', 'Rakefile']):
            return current_dir
        current_dir = os.path.dirname(current_dir)

    return None


def classify_error_type(error_message: str) -> str:
    """Classify error messages into types"""
    error_lower = error_message.lower()

    if any(word in error_lower for word in ['permission', 'access', 'denied']):
        return 'permission_error'
    elif any(word in error_lower for word in ['file not found', 'no such file', 'does not exist']):
        return 'file_not_found'
    elif any(word in error_lower for word in ['timeout', 'timed out']):
        return 'timeout_error'
    elif any(word in error_lower for word in ['network', 'connection', 'dns']):
        return 'network_error'
    elif any(word in error_lower for word in ['syntax', 'invalid', 'malformed']):
        return 'syntax_error'
    elif any(word in error_lower for word in ['out of memory', 'memory']):
        return 'memory_error'
    elif any(word in error_lower for word in ['command not found', 'not recognized']):
        return 'command_error'
    else:
        return 'unknown_error'


if __name__ == "__main__":
    main()
