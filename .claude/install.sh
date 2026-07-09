#!/bin/bash
# Install Claude Code dotfiles configuration to ~/.claude

set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "Installing Claude Code configuration from $DOTFILES_DIR"

# Ensure ~/.claude directory exists
mkdir -p "$CLAUDE_DIR"
# State dir for hook markers (e.g. pr_writer_gate.py's pr-writer.active).
# Not linked from dotfiles — it holds ephemeral, per-user runtime state.
# 0700 so a shared-host user cannot read or touch the freshness marker
# and quietly enable / disable the PR-writer gate for us.
mkdir -p "$CLAUDE_DIR/state"
chmod 700 "$CLAUDE_DIR/state"

# Backup existing settings.json if it exists and is not a symlink
if [[ -f "$CLAUDE_DIR/settings.json" && ! -L "$CLAUDE_DIR/settings.json" ]]; then
    echo "Backing up existing settings.json"
    cp "$CLAUDE_DIR/settings.json" "$CLAUDE_DIR/settings.json.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create symlinks for directories and files
echo "Creating symlinks..."

# `ln -sf <src> <dst>` does NOT replace a real directory at <dst>; it creates
# the symlink INSIDE that directory instead, leaving any pre-existing files
# stranded (an older statusline-command.sh in ~/.claude/scripts/ went stale
# this way). Replace any real directory or regular file at the target with a
# fresh symlink, after taking a timestamped backup so nothing local is lost.
# Remove stale recursive self-symlinks left by older versions of this script
# (pre-`ln -sfn`), e.g. claude/skills/skills -> claude/skills. Such a link
# lives directly inside a managed source directory and resolves back to that
# same directory. Only EXACT self-loops are removed; real symlinks that point
# elsewhere are left untouched. Because ~/.claude/<dir> is itself a symlink to
# the source dir, cleaning the source also clears the loop seen via ~/.claude.
cleanup_self_symlinks() {
    local dir="$1"
    # No-op for non-directories (e.g. CLAUDE.md). Must `return 0`: a bare
    # `return` propagates the failed `-d` test (exit 1) and `set -e` then
    # kills install.sh mid-run, skipping later steps (settings.json install,
    # chmod, etc.).
    [[ -d "$dir" ]] || return 0
    local dir_real entry entry_real
    dir_real="$(cd "$dir" && pwd -P)"
    for entry in "$dir"/*; do
        [[ -L "$entry" ]] || continue
        entry_real="$(cd "$entry" 2>/dev/null && pwd -P)" || continue
        if [[ "$entry_real" == "$dir_real" ]]; then
            echo "Removing stale recursive self-symlink $entry"
            rm "$entry"
        fi
    done
}

link_target() {
    local src="$1"
    local dst="$2"
    cleanup_self_symlinks "$src"
    if [[ -L "$dst" ]]; then
        # `-n` is load-bearing: without it `ln -s` follows an existing
        # symlink-to-directory and creates the new link INSIDE it, yielding a
        # recursive self-link (e.g. claude/skills/skills -> claude/skills). Do
        # NOT downgrade this to `ln -sf`.
        ln -sfn "$src" "$dst"
        return
    fi
    if [[ -e "$dst" ]]; then
        local backup="${dst}.backup.$(date +%Y%m%d_%H%M%S)"
        echo "Backing up existing $dst -> $backup"
        mv "$dst" "$backup"
    fi
    ln -s "$src" "$dst"
}

# Link directories
link_target "$DOTFILES_DIR/hooks"    "$CLAUDE_DIR/hooks"
link_target "$DOTFILES_DIR/agents"   "$CLAUDE_DIR/agents"
link_target "$DOTFILES_DIR/commands" "$CLAUDE_DIR/commands"
link_target "$DOTFILES_DIR/scripts"  "$CLAUDE_DIR/scripts"
link_target "$DOTFILES_DIR/shared"   "$CLAUDE_DIR/shared"
link_target "$DOTFILES_DIR/skills"   "$CLAUDE_DIR/skills"
link_target "$DOTFILES_DIR/rules"    "$CLAUDE_DIR/rules"
# Rule-pack catalog for invariant-lint (`.invariants.json` "extends") —
# /invariants-init reads it and the engine falls back to it when a repo has
# no vendored .invariants/packs/.
link_target "$DOTFILES_DIR/invariants" "$CLAUDE_DIR/invariants"

# Link individual files
link_target "$DOTFILES_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
link_target "$DOTFILES_DIR/.invariants.example.json" "$CLAUDE_DIR/.invariants.example.json"

# Install merged settings.json (not as symlink to avoid conflicts)
echo "Installing settings.json with hooks configuration..."
cp "$DOTFILES_DIR/settings.merged.json" "$CLAUDE_DIR/settings.json"

# Make shell wrappers executable (Python scripts are called via interpreter)
echo "Making hook wrappers executable..."
find "$DOTFILES_DIR/hooks/wrappers" -name "*.sh" -exec chmod +x {} \;

# Make user-facing scripts executable
echo "Making scripts executable..."
find "$DOTFILES_DIR/scripts" -name "*.sh" -exec chmod +x {} \;

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