"""
SessionStart Hook - Initialize session tracking with comprehensive environment context
"""
import sys
import os
import subprocess
import platform
from pathlib import Path
sys.path.insert(0, os.path.dirname(__file__))

from shared_utils import SessionTracker, read_hook_input, log_event, safe_exit, create_error_issue


def get_environment_info():
    """Capture comprehensive environment information"""
    env_info = {
        'python_version': sys.version.split()[0],
        'os': platform.system(),
        'os_version': platform.release(),
        'platform': platform.platform(),
        'shell': os.environ.get('SHELL', 'unknown'),
        'user': os.environ.get('USER', 'unknown'),
        'home': os.environ.get('HOME', 'unknown')
    }
    return env_info


def get_git_state(cwd):
    """Capture detailed git repository state"""
    if not cwd:
        return None
    
    git_info = {}
    
    try:
        # Check if in a git repo
        result = subprocess.run(
            ['git', 'rev-parse', '--git-dir'],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode != 0:
            return None
        
        # Get current branch
        result = subprocess.run(
            ['git', 'branch', '--show-current'],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5
        )
        git_info['branch'] = result.stdout.strip() if result.returncode == 0 else 'unknown'
        
        # Get last commit info
        result = subprocess.run(
            ['git', 'log', '-1', '--format=%H|%s|%an|%ar'],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split('|')
            if len(parts) == 4:
                git_info['last_commit'] = {
                    'hash': parts[0][:8],
                    'message': parts[1][:100],
                    'author': parts[2],
                    'when': parts[3]
                }
        
        # Count uncommitted changes
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            git_info['uncommitted_changes'] = len([l for l in lines if l.strip()])
        
        # Check if main/master exists
        result = subprocess.run(
            ['git', 'rev-parse', '--verify', 'main'],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            git_info['main_branch'] = 'main'
        else:
            result = subprocess.run(
                ['git', 'rev-parse', '--verify', 'master'],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=5
            )
            git_info['main_branch'] = 'master' if result.returncode == 0 else 'unknown'
        
        # Get remote info
        result = subprocess.run(
            ['git', 'remote', 'get-url', 'origin'],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            git_info['remote_url'] = result.stdout.strip()
        
        return git_info
        
    except Exception as e:
        log_event(f"Error getting git state: {str(e)}")
        return None


def detect_project_type(cwd):
    """Detect project type based on common files and patterns"""
    if not cwd:
        return 'unknown'
    
    cwd_path = Path(cwd)
    project_types = []
    
    # Ruby/Rails detection
    if (cwd_path / 'Gemfile').exists():
        project_types.append('ruby')
        if (cwd_path / 'config' / 'application.rb').exists():
            project_types.append('rails')
    
    # Python detection
    if any((cwd_path / f).exists() for f in ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile']):
        project_types.append('python')
        if (cwd_path / 'manage.py').exists():
            project_types.append('django')
    
    # JavaScript/Node detection
    if (cwd_path / 'package.json').exists():
        project_types.append('javascript')
        try:
            import json
            with open(cwd_path / 'package.json') as f:
                pkg = json.load(f)
                deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
                if 'react' in deps:
                    project_types.append('react')
                if 'next' in deps:
                    project_types.append('nextjs')
                if 'vue' in deps:
                    project_types.append('vue')
                if '@angular/core' in deps:
                    project_types.append('angular')
        except Exception:
            pass
    
    # Go detection
    if (cwd_path / 'go.mod').exists():
        project_types.append('go')
    
    # Rust detection
    if (cwd_path / 'Cargo.toml').exists():
        project_types.append('rust')
    
    # Java detection
    if (cwd_path / 'pom.xml').exists():
        project_types.append('java')
        project_types.append('maven')
    if (cwd_path / 'build.gradle').exists() or (cwd_path / 'build.gradle.kts').exists():
        project_types.append('java')
        project_types.append('gradle')
    
    # Infrastructure detection
    if any((cwd_path / f).exists() for f in ['terraform', 'main.tf', 'variables.tf']):
        project_types.append('terraform')
    if (cwd_path / 'Dockerfile').exists():
        project_types.append('docker')
    if (cwd_path / 'docker-compose.yml').exists() or (cwd_path / 'docker-compose.yaml').exists():
        project_types.append('docker-compose')
    
    # CI/CD detection
    if (cwd_path / '.github' / 'workflows').exists():
        project_types.append('github-actions')
    if (cwd_path / '.gitlab-ci.yml').exists():
        project_types.append('gitlab-ci')
    
    return project_types if project_types else ['unknown']


def get_claude_config_context():
    """Extract relevant info from Claude configuration"""
    config_info = {}
    
    # Check if Claude config file exists
    claude_config_path = Path.home() / '.claude' / 'CLAUDE.md'
    if claude_config_path.exists():
        config_info['has_global_config'] = True
        try:
            config_content = claude_config_path.read_text()
            config_info['config_size'] = len(config_content)
            
            # Extract key configuration flags
            config_info['orchestrator_enabled'] = 'orchestrator' in config_content.lower()
            config_info['auto_accept_mode'] = 'auto-accept' in config_content.lower()
            config_info['pr_only_mode'] = 'pr-only' in config_content.lower()
            
        except Exception as e:
            log_event(f"Error reading Claude config: {str(e)}")
    else:
        config_info['has_global_config'] = False
    
    # Check for project-specific Claude config
    project_config = Path.cwd() / 'claude' / 'CLAUDE.md'
    if project_config.exists():
        config_info['has_project_config'] = True
    else:
        config_info['has_project_config'] = False
    
    return config_info


def main():
    """Initialize session tracking when a session starts"""
    input_data = read_hook_input()
    session_id = input_data.get('session_id', 'unknown')
    cwd = input_data.get('cwd')

    try:
        log_event(f"Session started: {session_id}")

        # Gather comprehensive session context
        environment_info = get_environment_info()
        git_state = get_git_state(cwd)
        project_type = detect_project_type(cwd)
        claude_config = get_claude_config_context()

        tracker = SessionTracker()
        tracker.add_event(session_id, 'session_start', {
            'cwd': cwd,
            'reason': input_data.get('reason', 'new_session'),
            'permission_mode': input_data.get('permission_mode'),
            'environment': environment_info,
            'git_state': git_state,
            'project_type': project_type,
            'claude_config': claude_config
        })
        
        # Log summary
        project_type_str = ', '.join(project_type) if isinstance(project_type, list) else project_type
        log_event(f"Session initialized - Project: {project_type_str}, Branch: {git_state.get('branch', 'N/A') if git_state else 'N/A'}")
        
    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        log_event(f"Error in session_start: {str(e)}")
        create_error_issue(
            error_message=str(e),
            traceback_str=tb_str,
            hook_name="session_start",
            session_id=session_id,
            additional_context={"cwd": cwd, "input_data": input_data}
        )

    safe_exit(0)


if __name__ == "__main__":
    main()
