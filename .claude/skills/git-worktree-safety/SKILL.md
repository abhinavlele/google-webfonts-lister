---
name: git-worktree-safety
description: Safe git workflow using worktrees for parallel branch work. Use this skill whenever performing git operations in a repository. Enforces worktree-based workflows to avoid disrupting the user's working directory, and requires explicit permission before executing risky git commands (force push, reset, clean) or operating on protected branches (main/master).
---

# Git Worktree Safety

Use git worktrees for all branch-based work to preserve the user's current working directory state.

## Worktree Workflow

### Creating a Worktree

Create worktrees in `../worktrees/` relative to the repo root with random names:

```bash
# Generate random suffix
WORKTREE_NAME="worktree-$(head /dev/urandom | tr -dc a-z0-9 | head -c 8)"
WORKTREE_PATH="../worktrees/$WORKTREE_NAME"

# Create worktree for existing branch
git worktree add "$WORKTREE_PATH" <branch-name>

# Create worktree with new branch
git worktree add -b <new-branch-name> "$WORKTREE_PATH"
```

### Working in a Worktree

After creating, `cd` into the worktree path to perform all git operations for that branch. The main repository remains untouched.

### Cleaning Up Worktrees

**Always ask the user before removing a worktree.** Example prompt:

> "I've completed the work in worktree `../worktrees/worktree-a1b2c3d4` on branch `feature-xyz`. Would you like me to remove this worktree?"

If approved:
```bash
git worktree remove "$WORKTREE_PATH"
```

If the worktree has uncommitted changes, inform the user and ask how to proceed.

## Risky Command Guardrails

### Commands Requiring Permission

Before executing any of these commands, **stop and ask the user for explicit permission**, explaining the risk:

| Command | Risk |
|---------|------|
| `git push --force` / `git push -f` | Overwrites remote history, can lose others' commits |
| `git reset --hard` | Discards all uncommitted changes permanently |
| `git reset` (any form) | Can alter commit history or staging state |
| `git clean -fd` | Permanently deletes untracked files |
| `git checkout .` | Discards all uncommitted modifications |
| `git stash drop` / `git stash clear` | Permanently deletes stashed changes |

Example permission request:

> "This requires `git reset --hard`, which will permanently discard all uncommitted changes in this worktree. Proceed? (yes/no)"

### Protected Branches

**Never perform direct operations on `main` or `master` without explicit permission.** This includes:

- Direct commits
- Force pushes
- Resets
- Branch deletion

For changes to protected branches, prefer:
1. Create a feature branch in a worktree
2. Make changes and commit
3. Open a PR or ask user before merging

## Quick Reference

```bash
# List all worktrees
git worktree list

# Create worktree for existing branch
git worktree add ../worktrees/worktree-$(head /dev/urandom | tr -dc a-z0-9 | head -c 8) <branch>

# Create worktree with new branch
git worktree add -b <new-branch> ../worktrees/worktree-$(head /dev/urandom | tr -dc a-z0-9 | head -c 8)

# Remove worktree (ask user first!)
git worktree remove <path>

# Prune stale worktree references
git worktree prune
```
