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
Reports generated at 9 cumulative levels (no per-PR reports).
Tracks: A (NKey), B (OAuth), C (500K). Matrix: Spectrum/Shield x NKey/OAuth.

All work happens in worktree: ../poc-nats-reports
Main working directory is NEVER modified.

If you close this terminal, resume polling with:
  cd ~/src/limebike/poc-code-yellow-nats
  claude
  /report-poll

State tracked via: git show origin/poc:reports/state/last-processed.json
Local poll state: ../poc-nats-reports/.poll-state.json
```

## Arguments

$ARGUMENTS

If arguments include `--max-iterations`, use that value. Default: 50.
If arguments include `--interval`, use that as sleep seconds between polls. Default: 300.

## Required Permissions

This command runs autonomously in a Ralph loop. All these permissions must be pre-approved
in `~/.claude/settings.json` (allowedTools) or project `.claude/settings.local.json` (permissions.allow).

### Bash Commands Used

| Command | Step | Purpose |
|---------|------|---------|
| `git fetch` | 2 (Detect) | Fetch latest origin/poc |
| `git log` | 2 (Detect) | Find new merge commits |
| `git worktree list` | Setup | Check if worktree exists |
| `git worktree add` | Setup | Create persistent worktree |
| `git show` | Setup | Seed poll state from repo |
| `git checkout -B` | 4 (Prepare) | Create batch branch in worktree |
| `git add` | 9 (Commit) | Stage report files |
| `git commit` | 9 (Commit) | Commit reports |
| `git push` | 9 (Commit) | Push branch to remote |
| `git stash` | 9.5 (Conflicts) | Stash local state before rebase |
| `git rebase` | 9.5 (Conflicts) | Rebase on latest origin/poc |
| `git push --force-with-lease` | 9.5 (Conflicts) | Force-push after rebase |
| `gh pr list` | 5 (Collect) | Fetch merged PR metadata |
| `gh pr view` | 5 (Collect) | Fetch single PR metadata |
| `gh pr diff` | 5 (Collect) | Fetch PR diff |
| `gh pr create` | 9 (Commit) | Create reports PR |
| `gh pr merge` | 3.5 (Merge Previous) | Auto-merge previous reports PR |
| `gh api` | 5 (Collect) | Fetch PR comments, cross-repo data |
| `mkdir` | 4 (Prepare) | Create report directories |
| `cat` | 5 (Collect) | Read worktree files |
| `sleep` | 13 (Exit) | Wait between poll iterations |
| `python3` | 10 (State) | Update JSON state files |
| `date` | 4 (Prepare) | Generate branch/directory names |
| `wc` | 8.5 (Verify) | Check file lengths |
| `for` | 5 (Collect) | Loop over PRs for batch diff/comment fetching |
| `head` | 5 (Collect) | Truncate long outputs |

### Tools Used

| Tool | Purpose |
|------|---------|
| Read | Read poll state, cumulative reports, step-progress |
| Write | Update cumulative reports, update state JSON |
| Edit | Fix issues found during verification |
| Bash | All commands above |
| Agent (report-generator) | Spawn up to 9 parallel report writers |

### Settings Checklist

Verify these entries exist before running:

**`~/.claude/settings.json` -> `allowedTools`:**
- `Bash(git worktree:*)`, `Bash(git add:*)`, `Bash(git commit:*)`
- `Bash(git fetch:*)`, `Bash(git push:*)`, `Bash(git log:*)`
- `Bash(git diff:*)`, `Bash(git status:*)`, `Bash(git branch:*)`
- `Bash(git checkout:*)`, `Bash(git show:*)`, `Bash(git stash:*)`
- `Bash(git rebase:*)`, `Bash(sleep:*)`

**`~/.claude/settings.json` -> `permissions.allow`:**
- `Bash(gh pr view*)`, `Bash(gh pr list*)`, `Bash(gh pr diff*)`
- `Bash(gh pr create*)`, `Bash(gh pr merge*)`, `Bash(gh api*)`

**Project `.claude/settings.local.json` -> `permissions.allow`:**
- `Bash(sleep:*)`, `Bash(git:*)`, `Bash(mkdir:*)`
- `Bash(cat:*)`, `Bash(python3:*)`, `Bash(date:*)`
- `Bash(gh pr:*)`, `Bash(gh pr merge:*)`, `Bash(gh api:*)`
- `Bash(git rebase:*)`, `Bash(git push --force-with-lease:*)`
- `Bash(for:*)`, `Bash(head:*)`

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

Filter out any `reports/batch-*` branch PRs from the detected set. These are auto-generated report PRs, not work PRs, and must never be treated as new work to report on (doing so creates a self-triggering loop).

### 3. MERGE PREVIOUS REPORTS PR (EVERY ITERATION)

**This runs on EVERY iteration**, before checking for new merges. Check if there is an open reports PR from a previous iteration. If one exists, merge it so that `origin/poc` has the latest cumulative reports. This prevents agent state drift — without this step, agents check out from `origin/poc` and see stale cumulative data, causing them to revert progress (e.g., Step 3 from 100% back to 75%).

```bash
gh pr list --base poc --state open --author @me --json number,title,headRefName --jq '.[] | select(.headRefName | startswith("reports/batch-"))'
```

If a reports PR is found:

1. **Merge it:**
   ```bash
   gh pr merge <pr-number> --merge --delete-branch
   ```

2. **Re-fetch origin/poc** so the worktree checkout in Step 4 includes the merged reports:
   ```bash
   git fetch origin poc
   ```

3. **Log the merge:**
   ```
   Merged previous reports PR #<N> into poc before starting new batch.
   ```

If no open reports PR is found, skip this step silently.

If the merge fails (e.g., conflicts, failed checks), log a warning and continue:

```
Warning: Could not auto-merge previous reports PR #<N>: <error>. Proceeding with stale origin/poc. Will correct step values in orchestrator verification.
```

### 3.5. NO NEW MERGES?

If no new merges found after filtering:

```
No new merges detected. State unchanged.
Sleeping before next poll...
```

Exit this iteration. The Ralph loop hook will re-trigger the next iteration.

### 4. PREPARE WORKTREE FOR THIS ITERATION

The persistent worktree already exists. Create a new branch for this batch (Step 2 already fetched `origin/poc`, and Step 3.5 may have merged a previous reports PR and re-fetched):

```bash
cd ../poc-nats-reports
git checkout -B reports/batch-$(date +%Y-%m-%d-%H%M) origin/poc
```

This resets the worktree to the latest `origin/poc` and creates a fresh branch for this batch's PR.

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
cat ../poc-nats-reports/reports/cumulative/level5-benchmarks.md 2>/dev/null || echo ""
cat ../poc-nats-reports/reports/cumulative/level6-performance-decisions.md 2>/dev/null || echo ""
cat ../poc-nats-reports/reports/cumulative/level7-simulator-guide.md 2>/dev/null || echo ""
cat ../poc-nats-reports/reports/cumulative/level8-code-walkthrough.md 2>/dev/null || echo ""
cat ../poc-nats-reports/reports/cumulative/level9-engineering-tldr.md 2>/dev/null || echo ""
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

Create up to 9 tasks, one per report level. Each task description must include:
- The collected PR data (metadata + diff)
- The PR review comments and discussion comments (collected in step 5)
- The worktree path (`../poc-nats-reports`)
- The existing cumulative report content (read in step 5)
- The step-progress data (from `.step-progress-local.json`)
- Terraform logs from `infrastructure/terraform/logs/` (read in step 5)
- Mode: "cumulative-only" (no per-merge files are generated)
- `classified_prs` array from step 5.5: `[{ "pr": N, "path": "spectrum"|"nlb"|"shared"|"meta" }, ...]`
- `cross_repo_prs_enriched` array (live GitHub data merged onto static entries from `pr-classification.json`)
- `paths` summary from `step-progress.json`

### 7. SPAWN 7 AGENTS IN PARALLEL

Send a SINGLE message with up to 9 Task tool calls:

```
Task(
  prompt=<Level 1 task>,
  team_name="report-batch",
  name="level1-writer",
  subagent_type="report-generator"
)
Task(
  prompt=<Level 2 task>,
  team_name="report-batch",
  name="level2-writer",
  subagent_type="report-generator"
)
Task(
  prompt=<Level 3 task>,
  team_name="report-batch",
  name="level3-writer",
  subagent_type="report-generator"
)
Task(
  prompt=<Level 4 task>,
  team_name="report-batch",
  name="level4-writer",
  subagent_type="report-generator"
)
Task(
  prompt=<Level 5 task>,
  team_name="report-batch",
  name="level5-writer",
  subagent_type="report-generator"
)
Task(
  prompt=<Level 6 task>,
  team_name="report-batch",
  name="level6-writer",
  subagent_type="report-generator"
)
Task(
  prompt=<Level 7 task>,
  team_name="report-batch",
  name="level7-writer",
  subagent_type="report-generator"
)
Task(
  prompt=<Level 8 task>,
  team_name="report-batch",
  name="level8-writer",
  subagent_type="report-generator"
)
Task(
  prompt=<Level 9 task>,
  team_name="report-batch",
  name="level9-writer",
  subagent_type="report-generator"
)
```

**Level 5 (Benchmarks)**: Only spawn if the PR contains load test results, performance metrics, or benchmark data. Skip for pure infrastructure/docs PRs with no performance data.

**Level 6 (Performance Decisions)**: Only spawn if the PR contains a performance-related architectural decision (e.g., changing replica counts, timeout values, routing strategy, caching, resource limits). Skip for pure documentation or meta PRs.

**Level 7 (Simulator & Load Testing Guide)**: Only spawn if the PR touches files in `services/bike-simulator/`, `services/fleet-manager/`, `scripts/bulk-provision/`, `infrastructure/terraform/scripts/run-*-test.sh`, or `infrastructure/terraform/modules/load-test-fleet/`. Also spawn if the PR affects adjacent systems documented in the guide (e.g., auth callout behavior changes that alter the connection flow).

**Level 8 (Code Walkthrough)**: Only spawn if the PR touches Go source files (`.go`) in `services/auth-callout/`, `services/bike-simulator/`, `services/fleet-manager/`, or `scripts/bulk-provision/`. Also spawn if the PR affects configuration that changes how the code behaves (e.g., new env vars, changed Dockerfile). The Level 8 agent MUST read the actual source code files in the worktree (not just the diff) to verify code-level details.

**Level 9 (Engineering TLDR)**: ALWAYS spawn. Every PR batch triggers a full rewrite of `level9-engineering-tldr.md`. The agent reads the existing file plus all current PR data and rewrites the entire document with updated fixed sections (what landed, what's working, what's next, overall progress summary). Do NOT prepend a dated entry — the file is a living snapshot, not a changelog.

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
- The specific level assignment
- All PR data
- Worktree path and file paths
- Existing cumulative content

### 8. WAIT FOR COMPLETION

Messages arrive automatically as agents finish. Wait for all agents to report completion (up to 9, depending on which levels were relevant for this PR — Level 9 is always spawned).

### 8.5. ORCHESTRATOR VERIFICATION (MANDATORY)

After all agents complete, YOU (the orchestrator) must spot-check the cumulative reports before committing. Read the Level 2 executive summary and scan for:

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
git -c commit.gpgSign=true commit -m "Reports: PR #<numbers> batch update"
git push -u origin <branch-name>
gh pr create --base poc --title "Reports: PR #<numbers> batch" --body "$(cat <<'EOF'
## Summary

- Level 1: Technical log updated for PR(s) #<numbers>
- Level 2: Executive summary updated
- Level 3: Project progress tracker updated
- Level 4: Architecture documentation updated
- Level 5: Benchmark results updated (if applicable)
- Level 6: Performance decision log updated (if applicable)
- Level 7: Simulator & load testing guide updated (if applicable)
- Level 8: Code walkthrough updated (if applicable)

## Report Levels

| Level | Type | Status |
|-------|------|--------|
| 1 | Technical | Generated |
| 2 | Executive | Generated |
| 3 | PM Tracker | Generated |
| 4 | Architecture | Generated |
| 5 | Benchmarks | Generated / Skipped |
| 6 | Performance Decisions | Generated / Skipped |
| 7 | Simulator Guide | Generated / Skipped |
| 8 | Code Walkthrough | Generated / Skipped |
| 9 | Engineering TLDR | Generated |
EOF
)"
```

### 9.5. HANDLE MERGE CONFLICTS

After creating the PR, check if it can merge cleanly:

```bash
gh pr view <pr-number> --json mergeable,mergeStateStatus --jq '{mergeable: .mergeable, status: .mergeStateStatus}'
```

If `mergeable` is `CONFLICTING` or the push/PR creation failed:

1. **Fetch and rebase:**
   ```bash
   cd ../poc-nats-reports
   git fetch origin poc
   git rebase origin/poc
   ```

2. **If rebase succeeds cleanly** (no conflicts):
   ```bash
   git push --force-with-lease
   ```
   The PR is now conflict-free. Continue to Step 10.

3. **If rebase has conflicts** (files in both branches modified):
   ```bash
   git rebase --abort
   ```

   Then recreate the branch from scratch:
   ```bash
   git checkout -B <branch-name> origin/poc
   ```

   Re-read the now-current cumulative reports from the fresh checkout:
   ```bash
   cat reports/cumulative/level1-technical-log.md
   cat reports/cumulative/level2-executive-summary.md
   cat reports/cumulative/level3-project-tracker.md
   cat reports/cumulative/level4-architecture-docs.md
   cat reports/cumulative/level5-benchmarks.md 2>/dev/null || echo ""
   cat reports/cumulative/level6-performance-decisions.md 2>/dev/null || echo ""
   cat reports/cumulative/level7-simulator-guide.md 2>/dev/null || echo ""
   cat reports/cumulative/level8-code-walkthrough.md 2>/dev/null || echo ""
   cat reports/cumulative/level9-engineering-tldr.md 2>/dev/null || echo ""
   ```

   Regenerate ALL cumulative reports on top of the current `origin/poc` state.
   This is a full regeneration -- the orchestrator writes all files directly (no agents needed for conflict recovery).

   Then commit and force-push:
   ```bash
   git add reports/
   git -c commit.gpgSign=true commit -m "Reports: PR #<numbers> batch update (rebased)"
   git push --force-with-lease
   ```

   If the PR was already created, it will update automatically.
   If PR creation failed earlier, create it now:
   ```bash
   gh pr create --base poc --title "..." --body "..."
   ```

**Key principle:** Never leave a PR with conflicts. Either resolve them automatically or recreate the branch from the latest `origin/poc`.

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
SendMessage(type: "shutdown_request") to all agents
TeamDelete()
```

**Do NOT remove the worktree.** It persists for the next iteration and for future runs.

Return to the main repo working directory:

```bash
cd ~/src/limebike/poc-code-yellow-nats
```

### 12. PRINT VISUAL PROGRESS DASHBOARD

After each iteration (whether new merges were processed or not), read `.step-progress-local.json` and print a visual progress dashboard. This is the FIRST thing the user sees after each poll cycle.

```
=== NATS PoC Progress Dashboard ===

Track A (NKey — poc cluster):
  A1. Shield NLB        [··········]   0%  Not started
  A2. EC2 Fleet         [··········]   0%  Not started
  A3. External 100K     [··········]   0%  Not started
  A4. Reconnect/Chaos   [··········]   0%  Not started
  A5. Observability     [··········]   0%  Not started
  A6. Documentation     [########··]  80%  Runbooks + guides merged

Track B (OAuth — poc-oauth cluster):
  B1. OAuth Server      [··········]   0%  Not started
  B2. OAuth Auth Callout[··········]   0%  Not started
  B3. OAuth Simulator   [··········]   0%  Not started
  B4. OAuth Infra       [··········]   0%  Not started
  B5. OAuth 100K        [··········]   0%  Not started
  B6. OAuth Shield+NLB  [··········]   0%  Not started
  B7. OAuth Reconnect   [··········]   0%  Not started
  B8. OAuth Docs        [··········]   0%  Not started

Track C (500K — leaf nodes): Not started

Completed (Steps 0-12):
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 100%
  Auth approach, infra, auth callout, simulator, validation,
  provisioning, benchmarks, load tests (100K in-cluster passed)

4-Combo Matrix:
  Spectrum+NKey:  In-cluster 100K validated | External pending
  Shield+NKey:    Not started (Track A)
  Spectrum+OAuth: Not started (Track B)
  Shield+OAuth:   Not started (Track B)

Path Progress:
  Spectrum: N merged | M open | K cross-repo — Active
  NLB:      N merged | M open — Pending contract
  Shared:   N merged | M open

Cross-Repo:
  infra-terraform#1295: <status> (Spectrum config)
  infra-kubernetes#2897: <status> (Flux CRD)

This Iteration: Processed PR(s) #NN, #NN
PR: https://github.com/limebike/poc-code-yellow-nats/pull/NN
Next poll: HH:MM:SS ET (in NNs)
```

**How to render the progress bars:**

For each step in Tracks A, B, C, read `completion_pct` from `.step-progress-local.json`. Render a 10-character bar where each `#` represents 10% filled and `·` represents 10% empty. Use `✓ Complete` suffix for 100% steps.

The "Completed" section summarizes Steps 0-12 (the original linear plan, now fully done). Show a filled bar at the percentage from `completed_steps_pct` in the step-progress data.

**4-Combo Matrix**: Show the validation status for each of the 4 combinations: Spectrum+NKey, Shield+NKey, Spectrum+OAuth, Shield+OAuth. Each must independently validate 100K concurrent. Read from `combo_matrix` in step-progress data.

**Path Progress section**: Read the `paths` object from `.step-progress-local.json`. For each path (`spectrum`, `nlb`, `shared`), count merged PRs, open PRs, and cross-repo PRs. Append the path's status.

**Cross-Repo section**: Read the `cross_repo_prs_enriched` array. For each entry with a non-null `pr`, print status.

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

### 13. EXIT ITERATION

Log summary of what was processed. The Ralph loop hook will re-trigger the next iteration.

## Completion

The polling loop runs until max iterations. To stop early, use `/cancel-ralph`.

If you need to signal completion (e.g., user requested single poll):

```
<promise>POLL_COMPLETE</promise>
```
