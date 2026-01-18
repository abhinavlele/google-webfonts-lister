"""
PreToolUse Hook - Track tool usage patterns with enhanced context before execution
"""
import sys
import os
import time
from pathlib import Path
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit


def analyze_parameter_complexity(tool_params):
    """Analyze complexity of tool parameters"""
    if not tool_params:
        return {
            'complexity_score': 0,
            'complexity_level': 'none',
            'param_types': []
        }
    
    complexity_score = 0
    param_types = []
    
    for key, value in tool_params.items():
        # Track parameter type
        param_type = type(value).__name__
        param_types.append(param_type)
        
        # Score based on parameter type and size
        if isinstance(value, dict):
            complexity_score += 5 + len(value)
        elif isinstance(value, list):
            complexity_score += 3 + len(value)
        elif isinstance(value, str):
            complexity_score += 1
            if len(value) > 500:
                complexity_score += 3
            if len(value) > 1000:
                complexity_score += 5
        else:
            complexity_score += 1
    
    # Determine complexity level
    if complexity_score > 20:
        complexity_level = 'very_high'
    elif complexity_score > 10:
        complexity_level = 'high'
    elif complexity_score > 5:
        complexity_level = 'medium'
    elif complexity_score > 0:
        complexity_level = 'low'
    else:
        complexity_level = 'none'
    
    return {
        'complexity_score': complexity_score,
        'complexity_level': complexity_level,
        'param_count': len(tool_params),
        'param_types': list(set(param_types))
    }


def extract_file_path_context(tool_params, cwd):
    """Extract and analyze file path context from parameters"""
    path_context = {
        'has_paths': False,
        'paths': [],
        'path_analysis': {}
    }
    
    # Common parameter keys that contain paths
    path_keys = ['file_path', 'path', 'directory', 'dir', 'file', 'files']
    
    paths_found = []
    for key in path_keys:
        if key in tool_params:
            value = tool_params[key]
            if isinstance(value, str):
                paths_found.append(value)
            elif isinstance(value, list):
                paths_found.extend([p for p in value if isinstance(p, str)])
    
    if not paths_found:
        return path_context
    
    path_context['has_paths'] = True
    path_context['paths'] = paths_found
    
    # Analyze paths
    analysis = {
        'absolute_paths': 0,
        'relative_paths': 0,
        'existing_paths': 0,
        'missing_paths': 0,
        'extensions': []
    }
    
    for path_str in paths_found:
        try:
            path = Path(path_str)
            
            # Check if absolute or relative
            if path.is_absolute():
                analysis['absolute_paths'] += 1
            else:
                analysis['relative_paths'] += 1
            
            # Check existence (if we can resolve the path)
            full_path = path if path.is_absolute() else Path(cwd) / path if cwd else path
            try:
                if full_path.exists():
                    analysis['existing_paths'] += 1
                else:
                    analysis['missing_paths'] += 1
            except Exception:
                # Can't check existence (e.g., permission issues)
                pass
            
            # Track file extension
            if path.suffix:
                analysis['extensions'].append(path.suffix)
                
        except Exception:
            pass
    
    # Deduplicate extensions
    analysis['extensions'] = list(set(analysis['extensions']))
    path_context['path_analysis'] = analysis
    
    return path_context


def infer_tool_intent(tool_name, tool_params):
    """Infer the intent or purpose of this tool usage"""
    intents = []
    
    # File operation intents
    if tool_name == 'Read':
        intents.append('file_inspection')
    elif tool_name == 'Write':
        intents.append('file_creation')
    elif tool_name == 'Edit':
        intents.append('file_modification')
    elif tool_name in ['Glob', 'Grep']:
        intents.append('code_search')
    
    # Execution intents
    elif tool_name == 'Bash':
        command = tool_params.get('command', '').lower()
        if any(cmd in command for cmd in ['git', 'commit', 'push', 'pull']):
            intents.append('version_control')
        elif any(cmd in command for cmd in ['test', 'spec', 'jest', 'pytest']):
            intents.append('testing')
        elif any(cmd in command for cmd in ['npm', 'pip', 'bundle', 'gem']):
            intents.append('dependency_management')
        elif any(cmd in command for cmd in ['docker', 'kubectl']):
            intents.append('infrastructure')
        else:
            intents.append('command_execution')
    
    # Default to tool category
    if not intents:
        intents.append(classify_tool_category(tool_name))
    
    return intents


def main():
    """Track tool usage before execution"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    tool_name = input_data.get('tool_name', 'unknown')
    tool_params = input_data.get('tool_params', {})
    cwd = input_data.get('cwd', os.getcwd())

    log_event(f"Pre-tool use: {tool_name} in session: {session_id}")

    # Enhanced analysis
    param_complexity = analyze_parameter_complexity(tool_params)
    path_context = extract_file_path_context(tool_params, cwd)
    tool_intents = infer_tool_intent(tool_name, tool_params)
    
    # Analyze tool usage
    tool_analysis = {
        'tool_name': tool_name,
        'param_count': len(tool_params) if tool_params else 0,
        'param_complexity': param_complexity,
        'path_context': path_context,
        'tool_intents': tool_intents,
        'has_file_param': any('file' in str(k).lower() for k in (tool_params or {}).keys()),
        'has_path_param': any('path' in str(k).lower() for k in (tool_params or {}).keys()),
        'has_command_param': 'command' in (tool_params or {}),
        'start_time': time.time(),
        'tool_category': classify_tool_category(tool_name),
        'cwd': cwd
    }

    tracker = SessionTracker()
    data = tracker.load_session_data(session_id)

    # Track tool usage statistics
    if 'tool_usage' not in data:
        data['tool_usage'] = {}

    if tool_name not in data['tool_usage']:
        data['tool_usage'][tool_name] = {
            'count': 0,
            'categories': [],
            'average_duration': 0,
            'success_rate': 0,
            'failures': 0,
            'patterns': []
        }

    data['tool_usage'][tool_name]['count'] += 1

    tracker.save_session_data(session_id, data)
    tracker.add_event(session_id, 'pre_tool_use', tool_analysis)

    safe_exit(0)


def classify_tool_category(tool_name: str) -> str:
    """Classify tool into categories"""
    file_tools = ['Read', 'Write', 'Edit', 'Glob', 'MultiEdit']
    execution_tools = ['Bash', 'Task']
    search_tools = ['Grep', 'WebFetch', 'WebSearch']
    management_tools = ['TodoWrite', 'AskUserQuestion']
    notebook_tools = ['NotebookEdit']

    if tool_name in file_tools:
        return 'file_operation'
    elif tool_name in execution_tools:
        return 'execution'
    elif tool_name in search_tools:
        return 'search'
    elif tool_name in management_tools:
        return 'management'
    elif tool_name in notebook_tools:
        return 'notebook'
    else:
        return 'other'


if __name__ == "__main__":
    main()
