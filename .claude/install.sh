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
ln -sf "$DOTFILES_DIR/shared" "$CLAUDE_DIR/shared"
ln -sf "$DOTFILES_DIR/skills" "$CLAUDE_DIR/skills"
ln -sf "$DOTFILES_DIR/rules" "$CLAUDE_DIR/rules"

# Link individual files
ln -sf "$DOTFILES_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"

# Install merged settings.json (not as symlink to avoid conflicts)
echo "Installing settings.json with hooks configuration..."
cp "$DOTFILES_DIR/settings.merged.json" "$CLAUDE_DIR/settings.json"

# Make shell wrappers executable (Python scripts are called via interpreter)
echo "Making hook wrappers executable..."
find "$DOTFILES_DIR/hooks/wrappers" -name "*.sh" -exec chmod +x {} \;

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