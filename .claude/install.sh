#!/bin/bash
# Install Claude Code dotfiles configuration to ~/.claude

set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "Installing Claude Code configuration from $DOTFILES_DIR"

# Ensure ~/.claude directory exists
mkdir -p "$CLAUDE_DIR"

# Backup existing settings.json if it exists and is not a symlink
if [[ -f "$CLAUDE_DIR/settings.json" && ! -L "$CLAUDE_DIR/settings.json" ]]; then
    echo "Backing up existing settings.json"
    cp "$CLAUDE_DIR/settings.json" "$CLAUDE_DIR/settings.json.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create symlinks for directories and files
echo "Creating symlinks..."

# Link directories
ln -sf "$DOTFILES_DIR/hooks" "$CLAUDE_DIR/hooks"
ln -sf "$DOTFILES_DIR/agents" "$CLAUDE_DIR/agents"
ln -sf "$DOTFILES_DIR/commands" "$CLAUDE_DIR/commands"
ln -sf "$DOTFILES_DIR/scripts" "$CLAUDE_DIR/scripts"

# Link individual files
ln -sf "$DOTFILES_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"

# Install merged settings.json (not as symlink to avoid conflicts)
echo "Installing settings.json with hooks configuration..."
cp "$DOTFILES_DIR/settings.merged.json" "$CLAUDE_DIR/settings.json"

# Make shell wrappers executable (Python scripts are called via interpreter)
echo "Making hook wrappers executable..."
find "$DOTFILES_DIR/hooks/wrappers" -name "*.sh" -exec chmod +x {} \;

# Setup Langfuse hooks virtual environment
# Note: venv is created in dotfiles, accessible via ~/.claude/hooks/.venv symlink
echo "Setting up Langfuse hooks environment..."
HOOKS_VENV="$DOTFILES_DIR/hooks/.venv"

if [[ ! -d "$HOOKS_VENV" ]]; then
    # Check for Python 3.13 (required for langfuse, 3.14 not yet supported)
    if command -v python3.13 &> /dev/null; then
        echo "Creating hooks virtual environment with Python 3.13..."
        python3.13 -m venv "$HOOKS_VENV"
        echo "Installing langfuse package (v2 for compatibility)..."
        "$HOOKS_VENV/bin/pip" install --quiet 'langfuse<3.0'
        echo "✓ Langfuse hooks environment created"
    else
        echo "Warning: Python 3.13 not found. Langfuse observability will not work."
        echo "Install with: brew install python@3.13"
        echo "Then run this installer again."
    fi
else
    # Verify langfuse is installed (and correct version)
    if ! "$HOOKS_VENV/bin/python3" -c "import langfuse" 2>/dev/null; then
        echo "Installing langfuse package (v2 for compatibility)..."
        "$HOOKS_VENV/bin/pip" install --quiet 'langfuse<3.0'
        echo "✓ Langfuse package installed"
    else
        echo "✓ Langfuse hooks environment ready"
    fi
fi

# Verify Python dependencies
echo "Checking Python setup..."
if ! python3 -c "import json, sys, tempfile, subprocess, pathlib" 2>/dev/null; then
    echo "Warning: Some Python modules may not be available"
    echo "The hooks system uses: json, sys, tempfile, subprocess, pathlib"
fi

# Check git and gh CLI
echo "Checking required tools..."
if ! command -v git &> /dev/null; then
    echo "Warning: git is required for the hooks system"
fi

if ! command -v gh &> /dev/null; then
    echo "Warning: GitHub CLI (gh) is required for PR automation"
    echo "Install with: brew install gh"
fi

echo "✓ Claude Code hooks system installed successfully!"
echo ""
echo "Features enabled:"
echo "  - Comprehensive session tracking across all 10 hook events"
echo "  - Automatic conversation analysis and insights generation"
echo "  - GitHub PR creation for session summaries"
echo "  - Pattern detection and anti-pattern identification"
echo ""
echo "Output will be created in: https://github.com/abhinavlele/llm-scratchpad"
echo ""
echo "To test the system, start a new Claude Code session and interact with files."