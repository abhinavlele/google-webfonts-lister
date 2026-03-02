---
name: report-poll
description: Start a Ralph loop that polls for new merges to the poc branch and generates multi-level reports using team mode.
---

# Report Polling Loop

You are starting a reporting poll loop that watches for new merges to the `poc` branch and generates multi-level reports.

## Startup Reminder

**PRINT THIS AT THE START OF EVERY RUN:**

```
=== NATS PoC Report Polling Loop ===

Watching for new merges to origin/poc.
Reports generated at 4 levels: Technical, Executive, PM Tracker, Architecture.

All work happens in worktree: ../poc-nats-reports
Main working directory is NEVER modified.

If you close this terminal, resume polling with:
  cd /Users/abhinav.lele/src/limebike/poc-code-yellow-nats
  claude
  /report-poll

State tracked via: git show origin/poc:reports/state/last-processed.json
Local poll state: ../poc-nats-reports/.poll-state.json
```

## Arguments

$ARGUMENTS

If arguments include `--max-iterations`, use that value. Default: 50.
If arguments include `--interval`, use that as sleep seconds between polls. Default: 300.

## Initialize Ralph Loop

```python
import sys
import os
sys.path.insert(0, os.path.expanduser("~/.claude/hooks"))
from ralph_state import RalphState

ralph = RalphState()
ralph.start_loop(
    prompt="Poll for new merges to origin/poc and generate multi-level reports using team mode",
    completion_promise="POLL_COMPLETE",
    max_iterations=<extracted max_iterations or 50>,
    working_directory=os.getcwd()
)
```

Verify the loop is active, then proceed to setup.

## Setup: Ensure Persistent Worktree Exists (Once)

This runs ONCE at the start of the polling loop, NOT on every iteration.

### Check for existing worktree

```bash
git worktree list | grep poc-nats-reports
```

If the worktree already exists at `../poc-nats-reports`:
- Reuse it. Run `git -C ../poc-nats-reports fetch origin poc` and continue.

If no worktree exists:

```bash
git fetch origin poc
git worktree add --detach ../poc-nats-reports origin/poc
```

We use `--detach` so the worktree starts in detached HEAD state, avoiding branch name conflicts when creating per-iteration branches.

### Initialize local poll state

Check if `../poc-nats-reports/.poll-state.json` exists. If not, seed it from the repo's committed state:

```bash
git show origin/poc:reports/state/last-processed.json > ../poc-nats-reports/.poll-state.json 2>/dev/null || echo '{"last_merge_sha": "", "processed_prs": []}' > ../poc-nats-reports/.poll-state.json
```

Also seed step-progress if needed:

```bash
git show origin/poc:reports/state/step-progress.json > ../poc-nats-reports/.step-progress-local.json 2>/dev/null || echo '{}' > ../poc-nats-reports/.step-progress-local.json
```

These local files (`.poll-state.json`, `.step-progress-local.json`) are the source of truth for the polling loop. They persist across iterations AND across separate runs. They are NOT committed.

Now begin the first iteration.

---

## Each Iteration

### 1. ORIENT

Read poll state from the **worktree's local state file** (NOT from the main repo):

```bash
cat ../poc-nats-reports/.poll-state.json
```

### 2. DETECT

Fetch and check for new merges (fetch can run from either directory):

```bash
git fetch origin poc
git log <last_merge_sha>..origin/poc --merges --format="%H %s"
```

If `last_merge_sha` is empty (first run), use:

```bash
git log origin/poc --merges --format="%H %s"
```

Parse PR numbers from merge commit messages (pattern: `Merge pull request #NNN`).

Filter out PRs already in the `processed_prs` array from `.poll-state.json`.

### 3. NO NEW MERGES?

If no new merges found after filtering:

```
No new merges detected. State unchanged.
Sleeping before next poll...
```

Exit this iteration. The Ralph loop hook will re-trigger the next iteration.

### 4. PREPARE WORKTREE FOR THIS ITERATION

The persistent worktree already exists. Create a new branch for this batch (Step 2 already fetched `origin/poc` — no need to fetch again):

```bash
cd ../poc-nats-reports
git checkout -B reports/batch-$(date +%Y-%m-%d-%H%M) origin/poc
```

This resets the worktree to the latest `origin/poc` and creates a fresh branch for this batch's PR.

Create the per-merge directory:

```bash
mkdir -p ../poc-nats-reports/reports/per-merge/$(date +%Y-%m-%d)-pr-<NNN>/
```

If processing multiple PRs, create one directory per PR.

Ensure cumulative and state directories exist:

```bash
mkdir -p ../poc-nats-reports/reports/cumulative/
mkdir -p ../poc-nats-reports/reports/state/
```

### 5. COLLECT DATA

**For multiple new PRs**, batch the metadata fetch into a single API call:

```bash
gh pr list --base poc --state merged --json number,title,body,headRefName,mergedAt,mergeCommit,files,commits,labels --jq '[.[] | select(.number == <N1> or .number == <N2>)]'
```

**For a single new PR**, use the direct view:

```bash
gh pr view <N> --json number,title,body,headRefName,mergedAt,mergeCommit,files,commits,labels
```

For each PR, still fetch diff and comments individually:

```bash
gh pr diff <N>
gh api repos/{owner}/{repo}/pulls/<N>/comments --jq '.[] | {user: .user.login, body: .body, path: .path, created_at: .created_at}' 2>/dev/null || echo "[]"
gh api repos/{owner}/{repo}/issues/<N>/comments --jq '.[] | {user: .user.login, body: .body, created_at: .created_at}' 2>/dev/null || echo "[]"
```

The first comments endpoint returns **review comments** (inline on specific lines of code). The second returns **issue comments** (general discussion on the PR). Both provide context about decisions, reviewer feedback, and caveats that shaped the final code.

Read reference docs from the **worktree filesystem** (checked out in Step 4):

```bash
cat ../poc-nats-reports/docs/poc-plan.md
```

Read existing cumulative reports from the worktree for the agents to update:

```bash
cat ../poc-nats-reports/reports/cumulative/level1-technical-log.md 2>/dev/null || echo ""
cat ../poc-nats-reports/reports/cumulative/level2-executive-summary.md 2>/dev/null || echo ""
cat ../poc-nats-reports/reports/cumulative/level3-project-tracker.md 2>/dev/null || echo ""
cat ../poc-nats-reports/reports/cumulative/level4-architecture-docs.md 2>/dev/null || echo ""
```

Read Terraform logs from the worktree filesystem:

```bash
for log in ../poc-nats-reports/infrastructure/terraform/logs/*.log; do
  [ -f "$log" ] || continue
  echo "=== $(basename "$log") ==="
  cat "$log"
done
```

These logs contain Terraform plan/apply output showing actual AWS resources created, modified, or destroyed. They provide ground-truth infrastructure deployment data that supplements PR diffs.

Read step-progress from the local poll state:

```bash
cat ../poc-nats-reports/.step-progress-local.json
```

Read PR classification data from the worktree:

```bash
cat ../poc-nats-reports/reports/state/pr-classification.json 2>/dev/null || echo '{"prs":{}, "cross_repo_prs":[], "auto_classify_rules":[]}'
```

### 5.5. CLASSIFY PRs

For each new PR discovered in step 2, determine its path classification:

1. **Check manual entries first**: Look up `prs[N]` in `pr-classification.json`. If present, use that path.
2. **Try auto-classify rules**: Match the PR's `headRefName` against `auto_classify_rules` patterns (glob prefix match). First match wins.
3. **Default to `shared`**: If no manual entry and no rule matches, classify as `shared` and log a warning:
   ```
   ⚠ PR #N (branch: <branch>) auto-classified as 'shared' (no rule matched)
   ```

Build a `classified_prs` array: `[{ "pr": N, "path": "spectrum"|"nlb"|"shared"|"meta" }, ...]`

Also extract `cross_repo_prs` and `paths` from the classification and step-progress files.

### 5.6. FETCH CROSS-REPO PR METADATA

For each entry in `cross_repo_prs` where `pr` is not null:

```bash
gh pr view <pr> --repo <repo> --json number,title,state,url,files,mergedAt,headRefName 2>/dev/null || echo '{}'
```

Build `cross_repo_prs_enriched` by merging live data onto static entries. For entries with `pr: null`, pass through unchanged. The enriched array replaces the raw `cross_repo_prs` for all downstream steps.

### 6. CREATE TEAM AND TASKS

```
TeamCreate("report-batch")
```

Create 4 tasks, one per report level. Each task description must include:
- The collected PR data (metadata + diff)
- The PR review comments and discussion comments (collected in step 5)
- The worktree path (`../poc-nats-reports`)
- The per-merge directory path
- The existing cumulative report content (read in step 5)
- The step-progress data (from `.step-progress-local.json`)
- Terraform logs from `infrastructure/terraform/logs/` (read in step 5)
- Mode: "per-merge"
- `classified_prs` array from step 5.5: `[{ "pr": N, "path": "spectrum"|"nlb"|"shared"|"meta" }, ...]`
- `cross_repo_prs_enriched` array (live GitHub data merged onto static entries from `pr-classification.json`)
- `paths` summary from `step-progress.json`

### 7. SPAWN 4 AGENTS IN PARALLEL

Send a SINGLE message with 4 Task tool calls:

```
Task(
  prompt=<Level 1 task with PR data and worktree path>,
  team_name="report-batch",
  name="level1-writer",
  subagent_type="general-purpose"
)
Task(
  prompt=<Level 2 task with PR data and worktree path>,
  team_name="report-batch",
  name="level2-writer",
  subagent_type="general-purpose"
)
Task(
  prompt=<Level 3 task with PR data and worktree path>,
  team_name="report-batch",
  name="level3-writer",
  subagent_type="general-purpose"
)
Task(
  prompt=<Level 4 task with PR data and worktree path>,
  team_name="report-batch",
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
- All PR data
- Worktree path and file paths
- Existing cumulative content

### 8. WAIT FOR COMPLETION

Messages arrive automatically as agents finish. Wait for all 4 agents to report completion.

### 8.5. ORCHESTRATOR VERIFICATION (MANDATORY)

After all 4 agents complete, YOU (the orchestrator) must spot-check the cumulative reports before committing. Read the Level 2 executive summary and scan for:

```bash
# Read the Level 2 cumulative report
cat ../poc-nats-reports/reports/cumulative/level2-executive-summary.md
```

Check for:
1. **False deployment claims**: Any use of "deployed", "live", "operational", "running" that refers to Terraform modules (which are just merged code, not provisioned infrastructure). Fix if found.
2. **Forward-looking overreach**: Claims like "ready for Step N" when the prerequisite step isn't 100% complete. Fix if found.
3. **Consistency with step-progress data**: Does the Current Phase section match the actual step completion percentages from `.step-progress-local.json`?

If any issues are found, edit the file directly before committing. This is the final quality gate.

### 9. COMMIT AND PR

In the worktree (all commands run with `-C` or from the worktree path):

```bash
cd ../poc-nats-reports
git add reports/
git commit -m "Reports: PR #<numbers> batch update"
git push -u origin <branch-name>
gh pr create --base poc --title "Reports: PR #<numbers> batch" --body "$(cat <<'EOF'
## Summary

- Level 1: Detailed technical report for PR(s) #<numbers>
- Level 2: Executive summary updated
- Level 3: Project progress tracker updated
- Level 4: Architecture documentation updated

## Report Levels

| Level | Type | Status |
|-------|------|--------|
| 1 | Technical | Generated |
| 2 | Executive | Generated |
| 3 | PM Tracker | Generated |
| 4 | Architecture | Generated |
EOF
)"
```

### 10. UPDATE LOCAL POLL STATE

Update the **local poll state files in the worktree** (NOT the main repo):

Update `../poc-nats-reports/.poll-state.json`:
- Add newly processed PR numbers to `processed_prs`
- Update `last_merge_sha` to the latest merge commit SHA
- Update `last_merge_pr` and `last_processed_at`
- Increment `total_merges_processed`

Update `../poc-nats-reports/.step-progress-local.json`:
- Update step completion data based on newly processed PRs

Reconcile cross-repo PR status in `../poc-nats-reports/.step-progress-local.json`:
- Compare each cross-repo PR's live GitHub state (from `cross_repo_prs_enriched`) against local status
- If GitHub says MERGED but local says "open" → update `paths.spectrum.cross_repo_prs` entry to "(merged)"
- If GitHub says OPEN but local says "planned" → update entry to "(open)"
- Log any status transitions in the dashboard output

Use Python or jq to update the JSON. Write the updated content using the Write tool.

**IMPORTANT**: Do NOT modify any files in the main working directory. All state updates go to the worktree's local files.

### 11. CLEANUP TEAM (Keep Worktree)

```
SendMessage(type: "shutdown_request") to all 4 agents
TeamDelete()
```

**Do NOT remove the worktree.** It persists for the next iteration and for future runs.

Return to the main repo working directory:

```bash
cd /Users/abhinav.lele/src/limebike/poc-code-yellow-nats
```

### 12. PRINT VISUAL PROGRESS DASHBOARD

After each iteration (whether new merges were processed or not), read `.step-progress-local.json` and print a visual progress dashboard. This is the FIRST thing the user sees after each poll cycle.

```
=== NATS PoC Progress Dashboard ===

Overall: NN% across 10 steps
▓▓▓▓▓▓░░░░░░░░░░░░░░ 32%

Step Progress:
  1. Auth Approach    [##########] 100%  ✓ Complete
  2. Infrastructure   [#########·]  91%  10/11 merged | 1 open
  3. Auth Callout     [##········]  25%  K8s infra only, no Go service
  4. Bike Simulator   [··········]   0%  Not started
  5. Validation       [··········]   0%  Not started
  6. Provisioning     [··········]   0%  Not started
  7. Edge Layer       [##········]  25%  1/4 merged | 3 open
  8. Benchmark        [··········]   0%  Not started
  9. Load Testing     [··········]   0%  Not started
 10. Documentation    [··········]   0%  1 open

Path Progress:
  Spectrum: N merged | M open | K cross-repo — Active
  NLB:      N merged | M open — Pending contract
  Shared:   N merged | M open

This Iteration: Processed PR(s) #NN, #NN
PR: https://github.com/limebike/poc-code-yellow-nats/pull/NN
Next poll: HH:MM:SS AM/PM ET (in NNs)
```

**How to render the progress bars:**

For each step, read the `completion_pct` from `.step-progress-local.json`. Render a 10-character bar where each `#` represents 10% filled and `·` represents 10% empty. Use `✓ Complete` suffix for 100% steps.

The overall percentage is `average(completion_pct)` across all 10 steps. This reflects milestone progress, not PR counts.

**Path Progress section**: Read the `paths` object from `.step-progress-local.json`. For each path (`spectrum`, `nlb`, `shared`), count merged PRs, open PRs, and cross-repo PRs. Append the path's status (e.g., "Active", "Pending contract"). Example:

```
Path Progress:
  Spectrum: 1 merged | 2 open | 1 cross-repo — Active
  NLB:      2 merged | 1 open — Pending contract
  Shared:   17 merged | 3 open
```

Include the step notes (abbreviated) after the percentage for context. For steps with 0%, show "Not started" or the relevant note.

**Cross-Repo section** (append after Path Progress):

Read the `cross_repo_prs_enriched` array. For each entry with a non-null `pr`, print:

```
Cross-Repo:
  <repo>#<pr>: <status> (<short description>)
```

Example:

```
Cross-Repo:
  infra-terraform#1295: open (Spectrum config)
  infra-kubernetes#2897: open (Flux CRD)
```

If any status transitions occurred during reconciliation (Step 10), append a note:

```
  ↳ infra-terraform#1295: planned → open (status updated)
```

If no new merges were processed this iteration, still print the dashboard but change the "This Iteration" line to:

```
This Iteration: No new merges detected. Polling...
```

**Always append a "Next poll" line at the bottom of the dashboard**, showing when the next poll will run. Calculate based on the current time plus the `--interval` value (default 60 seconds). **Use US Eastern timezone** (ET), not UTC:

```
Next poll: HH:MM:SS ET (in NNs)
```

For example:
```
Next poll: 5:15:30 PM ET (in 60s)
```

### 13. EXIT ITERATION

Log summary of what was processed. The Ralph loop hook will re-trigger the next iteration.

## Completion

The polling loop runs until max iterations. To stop early, use `/cancel-ralph`.

If you need to signal completion (e.g., user requested single poll):

```
<promise>POLL_COMPLETE</promise>
```
