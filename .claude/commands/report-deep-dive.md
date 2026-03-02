---
name: report-deep-dive
description: Generate comprehensive reports from scratch across the full merge history of the poc branch using team mode with 4 parallel agents.
---

# Report Deep Dive

Generate all 4 levels of reports from scratch by analyzing every merged PR in the `poc` branch history.

## Arguments

$ARGUMENTS

## Process

### 1. COLLECT ALL DATA

Gather complete merge history:

```bash
# All merged PRs
gh pr list --base poc --state merged --json number,title,body,headRefName,mergedAt,mergeCommit,files,commits,labels --jq 'sort_by(.mergedAt)'

# Diff for each merged PR
for pr in <merged_pr_numbers>; do
  gh pr diff $pr
done

# All open PRs (for progress tracking)
gh pr list --base poc --state open --json number,title,headRefName

# Reference documents
cat docs/poc-plan.md

# Terraform logs (infrastructure deployment details)
for log in infrastructure/terraform/logs/*.log; do
  echo "=== $log ==="
  cat "$log"
done
```

Read PR classification data:

```bash
cat reports/state/pr-classification.json 2>/dev/null || echo '{"prs":{}, "cross_repo_prs":[], "auto_classify_rules":[]}'
```

Read step-progress (for paths summary):

```bash
cat reports/state/step-progress.json
```

### 1.5. CLASSIFY ALL MERGED PRs

For each merged PR, determine its path classification:

1. **Check manual entries first**: Look up `prs[N]` in `pr-classification.json`. If present, use that path.
2. **Try auto-classify rules**: Match the PR's `headRefName` against `auto_classify_rules` patterns (glob prefix match). First match wins.
3. **Default to `shared`**: If no manual entry and no rule matches, classify as `shared`.

Build a `classified_prs` array: `[{ "pr": N, "path": "spectrum"|"nlb"|"shared"|"meta" }, ...]`

Also extract `cross_repo_prs` and `paths` from the classification and step-progress files.

### 2. CREATE WORKTREE

```bash
git worktree add -b reports/deep-dive-$(date +%Y-%m-%d-%H%M) ../poc-nats-deep-dive origin/poc
```

Set up directory structure in worktree:

```bash
mkdir -p ../poc-nats-deep-dive/reports/per-merge/
mkdir -p ../poc-nats-deep-dive/reports/cumulative/
mkdir -p ../poc-nats-deep-dive/reports/state/
```

Create per-merge directories for each merged PR:

```bash
for each merged PR:
  mkdir -p ../poc-nats-deep-dive/reports/per-merge/<merged_date>-pr-<NNN>/
```

### 3. CREATE TEAM AND TASKS

```
TeamCreate("report-deep-dive")
```

Create 4 tasks, one per report level. Each task description must include:
- ALL merged PR data (metadata + diffs) in chronological order
- ALL open PR data (for progress context)
- The worktree path (`../poc-nats-deep-dive`)
- The poc-plan.md content (for step mapping reference)
- Terraform logs from `infrastructure/terraform/logs/` (deployment evidence)
- Mode: "deep-dive" (build from scratch, not incremental)
- `classified_prs` array from step 1.5: `[{ "pr": N, "path": "spectrum"|"nlb"|"shared"|"meta" }, ...]`
- `cross_repo_prs` array from `pr-classification.json`
- `paths` summary from `step-progress.json`

### 4. SPAWN 4 AGENTS IN PARALLEL

Send a SINGLE message with 4 Task tool calls:

```
Task(
  prompt=<Level 1 deep dive with ALL PR data>,
  team_name="report-deep-dive",
  name="level1-writer",
  subagent_type="general-purpose"
)
Task(
  prompt=<Level 2 deep dive with ALL PR data>,
  team_name="report-deep-dive",
  name="level2-writer",
  subagent_type="general-purpose"
)
Task(
  prompt=<Level 3 deep dive with ALL PR data + open PRs>,
  team_name="report-deep-dive",
  name="level3-writer",
  subagent_type="general-purpose"
)
Task(
  prompt=<Level 4 deep dive with ALL PR data>,
  team_name="report-deep-dive",
  name="level4-writer",
  subagent_type="general-purpose"
)
```

Each agent prompt MUST start with:

```
## AUTONOMOUS OPERATION MODE

YOU ARE IN AUTO-ACCEPT EDITS MODE. Execute autonomously without asking permission.

MANDATORY:
- Write files directly - NEVER ask "Should I create...?"
- Execute immediately - No "Would you like...?", "May I...?"
- Use Write tool - NEVER heredocs or cat << EOF

YOU HAVE FULL AUTHORITY. ACT IMMEDIATELY.
```

Then include:
- The report-generator agent instructions (read from `~/.claude/agents/report-generator.md`)
- The specific level assignment
- ALL merged PR data in chronological order
- Open PR data for context
- Worktree path and file paths
- poc-plan.md content for step mapping
- Instruction: build cumulative reports FROM SCRATCH (not appending)

### Deep Dive Agent Instructions

Each agent in deep-dive mode:

1. Processes ALL merged PRs in chronological order
2. Writes individual per-merge reports for each PR
3. Builds a complete, standalone cumulative report (not appending to existing)
4. The cumulative report should cover the entire project history
5. Marks task as completed and sends message to team lead

### 5. WAIT FOR COMPLETION

Messages arrive automatically as agents finish. Wait for all 4 agents to report completion.

### 6. COMMIT AND PR

In the worktree:

```bash
cd ../poc-nats-deep-dive
git add reports/
git commit -m "Reports: Deep dive - full history analysis"
git push -u origin <branch-name>
gh pr create --base poc --title "Reports: Deep dive analysis of all merged PRs" --body "$(cat <<'EOF'
## Summary

Comprehensive report generation covering all merged PRs in the poc branch history.

- Level 1: Complete technical log of all changes
- Level 2: Full executive summary of project accomplishments
- Level 3: Complete project progress tracker against 10-step plan
- Level 4: Current-state architecture documentation with diagrams

## Report Levels

| Level | Type | Coverage |
|-------|------|----------|
| 1 | Technical | All merged PRs |
| 2 | Executive | Full project summary |
| 3 | PM Tracker | Complete progress assessment |
| 4 | Architecture | Current-state diagrams |
EOF
)"
```

### 7. UPDATE STATE

Update state files in the MAIN repo:

- `reports/state/last-processed.json` - set to latest merge SHA, add all processed PRs
- `reports/state/step-progress.json` - recalculate all step completion data
- `reports/state/pr-classification.json` - merge any newly auto-classified PRs into the `prs` object. **Never overwrite manual entries** — only add PRs that were auto-classified during step 1.5 and don't already have a manual entry. This persists auto-classifications for future runs.

### 8. CLEANUP

```
SendMessage(type: "shutdown_request") to all 4 agents
TeamDelete()
```

```bash
git worktree remove ../poc-nats-deep-dive
```

Done. Report the PR URL to the user.
