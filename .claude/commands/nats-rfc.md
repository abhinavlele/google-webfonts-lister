---
name: nats-rfc
description: Resume the NATS Device Identity RFC session with full context loaded.
---

# NATS Device Identity RFC — Resume Context

You are resuming work on the NATS Device Identity Architecture RFC.

## Step 1: Load State

Read these files to understand current progress:

1. `rfc/.local-state/rfc-progress.json` — Phase, section status, corrections applied
2. `rfc/.local-state/phase-summaries.md` — What happened in each phase
3. `rfc/.local-state/feedback-log.json` — User feedback per section (if exists)

## Step 2: Load Memory

Read these memory files for architectural decisions and style rules:

1. Memory: `rfc_decisions.md` — Hybrid stance (NKey+Shield for NATS, OAuth for HTTP), scope, audience
2. Memory: `feedback_rfc_tone.md` — Writing style: human, formal, short sentences, no em dashes
3. Memory: `rfc_source_mapping.md` — Pointer to source-to-section mapping
4. Memory: `rfc_agent_architecture.md` — Multi-agent architecture, phases, resume protocol

## Step 3: Check Branch and PR State

Run these commands to understand current branch/PR state:

```bash
# Check open RFC PRs
gh pr list --repo limebike/poc-code-yellow-nats --search "rfc/" --state open

# Check merged RFC PRs
gh pr list --repo limebike/poc-code-yellow-nats --search "rfc/" --state merged --limit 15

# Check RFC branch status
git -C ~/src/limebike/poc-code-yellow-nats branch -a | grep rfc

# Check for active worktrees
git -C ~/src/limebike/poc-code-yellow-nats worktree list | grep rfc
```

## Step 4: Read Current RFC

Read the RFC on the latest RFC branch (not poc — the RFC lives on `rfc/nats-device-identity`):

```bash
# Find the latest RFC content
git -C ~/src/limebike/poc-code-yellow-nats show origin/rfc/nats-device-identity:rfc/nats-device-identity.md | wc -l
```

Then read `rfc/nats-device-identity.md` from whichever worktree has the latest RFC branch checked out.

## Step 5: Print Status Summary

After loading all context, print a summary:

```
=== NATS Device Identity RFC ===

Phase: [current phase from rfc-progress.json]
RFC branch: rfc/nats-device-identity
Open PRs: [list any open]
Last merged PR: [most recent merged RFC PR]
RFC length: [line count]
Stance: Hybrid — NKey+Shield for NATS, OAuth for HTTP

Sections:
  1. Context:        [status]
  2. Design:         [status]
  3. Infrastructure: [status]
  4. Security:       [status]
  5. Rollout:        [status]

Ready for instructions.
```

## Key Facts

- **Primary branch**: `poc` (not main). RFC branch: `rfc/nats-device-identity` (targets poc eventually)
- **All edits in worktrees**: Never edit files directly on the poc working tree
- **Worktrees based on RFC branch**: `git worktree add -b rfc/<feature> <path> origin/rfc/nats-device-identity`
- **PR target**: All RFC PRs target `rfc/nats-device-identity` as base branch
- **Headline number**: 1,000,000 concurrent connections at 100.00% (C3, Shield+NKey)
- **On-device keygen**: All keypairs generated ON the device (CCU). Seeds never transmitted.
- **Style**: Human, formal, short sentences, no em dashes, no filler, active voice, precise numbers

## Source Material Locations

- `discussions/nats-identity-architecture-review/*.md` — 11 architecture review docs
- `docs/*.md` — Scaling plan, comparisons, specs, factory integration
- `reports/cumulative/level{4,5,6,9}-*.md` — Architecture, benchmarks, decisions, TLDR
- `reports/state/pr-classification.json` — PR mapping
- `logs/load-tests/` — Raw test results (C2: 500K, C3: 1M)
