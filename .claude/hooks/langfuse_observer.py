"""
Langfuse Observer for Claude Code hooks

Sends Claude Code activity to a self-hosted Langfuse instance for LLM observability.
Requires: pip install langfuse

Environment variables:
  LANGFUSE_ENABLED=1          - Enable Langfuse integration
  LANGFUSE_HOST=http://localhost:<port>  - Langfuse server URL (auto-calculated per-user if not set)
  LANGFUSE_PUBLIC_KEY=pk-...  - Public key from Langfuse settings
  LANGFUSE_SECRET_KEY=sk-...  - Secret key from Langfuse settings
"""
import os
import sys
from datetime import datetime
from typing import Any, Dict, Optional

# Check if Langfuse is enabled
LANGFUSE_ENABLED = os.environ.get('LANGFUSE_ENABLED', '0') == '1'


def _get_default_langfuse_host() -> str:
    """Calculate per-user Langfuse host based on UID (matches zshrc logic)"""
    uid = os.getuid()
    port_offset = uid % 10000
    web_port = 13000 + port_offset
    return f"http://localhost:{web_port}"

# Lazy-loaded Langfuse client
_langfuse_client = None


def _get_langfuse():
    """Get or create Langfuse client (lazy initialization)"""
    global _langfuse_client

    if not LANGFUSE_ENABLED:
        return None

    if _langfuse_client is not None:
        return _langfuse_client

    try:
        from langfuse import Langfuse

        _langfuse_client = Langfuse(
            public_key=os.environ.get('LANGFUSE_PUBLIC_KEY', 'pk-lf-local'),
            secret_key=os.environ.get('LANGFUSE_SECRET_KEY', 'sk-lf-local'),
            host=os.environ.get('LANGFUSE_HOST') or _get_default_langfuse_host(),
            flush_at=1,  # Flush immediately for real-time visibility
            flush_interval=1,
        )
        return _langfuse_client
    except ImportError:
        print("[Langfuse] langfuse package not installed. Run: pip install langfuse", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[Langfuse] Failed to initialize: {e}", file=sys.stderr)
        return None


def is_enabled() -> bool:
    """Check if Langfuse observability is enabled"""
    return LANGFUSE_ENABLED


def trace_session_start(
    session_id: str,
    cwd: Optional[str] = None,
    project_type: Optional[list] = None,
    git_state: Optional[Dict] = None,
    **metadata
):
    """Record session start event"""
    langfuse = _get_langfuse()
    if not langfuse:
        return None

    try:
        trace = langfuse.trace(
            name="claude-code-session",
            id=session_id,
            user_id=os.environ.get('USER', 'unknown'),
            session_id=session_id,
            input={"cwd": cwd},
            metadata={
                "project_type": project_type,
                "git_branch": git_state.get('branch') if git_state else None,
                "git_remote": git_state.get('remote_url') if git_state else None,
                **metadata
            },
            tags=["claude-code", "session-start"],
        )
        langfuse.flush()
        return trace
    except Exception as e:
        print(f"[Langfuse] trace_session_start error: {e}", file=sys.stderr)
        return None


def trace_session_end(
    session_id: str,
    reason: Optional[str] = None,
    **metadata
):
    """Record session end event"""
    langfuse = _get_langfuse()
    if not langfuse:
        return None

    try:
        # Update existing trace with end info
        trace = langfuse.trace(
            id=session_id,
            output={"reason": reason},
            metadata=metadata,
        )
        langfuse.flush()
        return trace
    except Exception as e:
        print(f"[Langfuse] trace_session_end error: {e}", file=sys.stderr)
        return None


def trace_user_prompt(
    session_id: str,
    prompt: str,
    prompt_id: Optional[str] = None,
    **metadata
):
    """Record user prompt submission"""
    langfuse = _get_langfuse()
    if not langfuse:
        return None

    try:
        trace = langfuse.trace(
            name="user-prompt",
            session_id=session_id,
            user_id=os.environ.get('USER', 'unknown'),
            input={"prompt": prompt[:1000]},  # Truncate very long prompts
            metadata={
                "prompt_length": len(prompt),
                "timestamp": datetime.now().isoformat(),
                **metadata
            },
            tags=["claude-code", "user-prompt"],
        )
        langfuse.flush()
        return trace
    except Exception as e:
        print(f"[Langfuse] trace_user_prompt error: {e}", file=sys.stderr)
        return None


def trace_tool_start(
    session_id: str,
    tool_name: str,
    tool_input: Dict[str, Any],
    tool_use_id: Optional[str] = None,
    **metadata
):
    """Record tool execution start (PreToolUse)"""
    langfuse = _get_langfuse()
    if not langfuse:
        return None

    try:
        # Sanitize tool input (remove large content)
        sanitized_input = _sanitize_tool_data(tool_input, max_content_length=500)

        span = langfuse.span(
            name=f"tool-{tool_name.lower()}",
            trace_id=session_id,
            input=sanitized_input,
            metadata={
                "tool_name": tool_name,
                "tool_use_id": tool_use_id,
                "timestamp": datetime.now().isoformat(),
                **metadata
            },
        )
        langfuse.flush()
        return span
    except Exception as e:
        print(f"[Langfuse] trace_tool_start error: {e}", file=sys.stderr)
        return None


def trace_tool_end(
    session_id: str,
    tool_name: str,
    tool_input: Dict[str, Any],
    tool_response: Dict[str, Any],
    tool_use_id: Optional[str] = None,
    success: bool = True,
    **metadata
):
    """Record tool execution completion (PostToolUse)"""
    langfuse = _get_langfuse()
    if not langfuse:
        return None

    try:
        # Sanitize data
        sanitized_input = _sanitize_tool_data(tool_input, max_content_length=500)
        sanitized_output = _sanitize_tool_data(tool_response, max_content_length=1000)

        # Create a generation for the tool call
        generation = langfuse.generation(
            name=f"tool-{tool_name.lower()}",
            trace_id=session_id,
            input=sanitized_input,
            output=sanitized_output,
            model=f"claude-tool-{tool_name.lower()}",
            metadata={
                "tool_name": tool_name,
                "tool_use_id": tool_use_id,
                "success": success,
                "timestamp": datetime.now().isoformat(),
                **metadata
            },
            level="DEFAULT" if success else "ERROR",
        )
        langfuse.flush()
        return generation
    except Exception as e:
        print(f"[Langfuse] trace_tool_end error: {e}", file=sys.stderr)
        return None


def trace_stop(
    session_id: str,
    reason: Optional[str] = None,
    **metadata
):
    """Record Claude stop event"""
    langfuse = _get_langfuse()
    if not langfuse:
        return None

    try:
        event = langfuse.event(
            name="claude-stop",
            trace_id=session_id,
            input={"reason": reason},
            metadata={
                "timestamp": datetime.now().isoformat(),
                **metadata
            },
        )
        langfuse.flush()
        return event
    except Exception as e:
        print(f"[Langfuse] trace_stop error: {e}", file=sys.stderr)
        return None


def trace_error(
    session_id: str,
    error_message: str,
    hook_name: str,
    **metadata
):
    """Record an error event"""
    langfuse = _get_langfuse()
    if not langfuse:
        return None

    try:
        event = langfuse.event(
            name="hook-error",
            trace_id=session_id,
            input={
                "error": error_message,
                "hook": hook_name,
            },
            metadata={
                "timestamp": datetime.now().isoformat(),
                **metadata
            },
            level="ERROR",
        )
        langfuse.flush()
        return event
    except Exception as e:
        print(f"[Langfuse] trace_error error: {e}", file=sys.stderr)
        return None


def _sanitize_tool_data(data: Dict[str, Any], max_content_length: int = 500) -> Dict[str, Any]:
    """Sanitize tool data to avoid sending huge payloads to Langfuse"""
    if not isinstance(data, dict):
        return data

    sanitized = {}
    for key, value in data.items():
        if key in ('content', 'stdout', 'stderr', 'output', 'file_content'):
            # Truncate large content fields
            if isinstance(value, str) and len(value) > max_content_length:
                sanitized[key] = value[:max_content_length] + f"... [truncated {len(value) - max_content_length} chars]"
            else:
                sanitized[key] = value
        elif isinstance(value, dict):
            sanitized[key] = _sanitize_tool_data(value, max_content_length)
        elif isinstance(value, list) and len(value) > 10:
            sanitized[key] = value[:10] + [f"... and {len(value) - 10} more items"]
        else:
            sanitized[key] = value

    return sanitized


def flush():
    """Force flush any pending events to Langfuse"""
    langfuse = _get_langfuse()
    if langfuse:
        try:
            langfuse.flush()
        except Exception as e:
            print(f"[Langfuse] flush error: {e}", file=sys.stderr)


def shutdown():
    """Shutdown Langfuse client gracefully"""
    global _langfuse_client
    if _langfuse_client:
        try:
            _langfuse_client.flush()
            _langfuse_client.shutdown()
        except Exception:
            pass
        _langfuse_client = None
