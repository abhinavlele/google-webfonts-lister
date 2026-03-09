---
name: report-status-changes
description: Generate a status changes report covering a configurable time window. Appends timestamped entries to the consolidated status changelog.
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
---

# Status Changes Report

You are generating a point-in-time status changes report for the NATS Identity Architecture PoC. This command detects what changed in a configurable time window and appends a new entry to the consolidated status changelog.

## Arguments

$ARGUMENTS

If arguments include `--hours`, use that value as the lookback window. Default: **24**.
If arguments include `--since`, use that ISO timestamp as the cutoff instead of computing from `--hours`.

Examples:
- `/report-status-changes` → last 24 hours
- `/report-status-changes --hours 48` → last 48 hours
- `/report-status-changes --hours 1` → last 1 hour
- `/report-status-changes --since 2026-03-01T00:00:00Z` → since that exact timestamp

## 1. SETUP WORKTREE

Reuse the persistent report worktree if it exists, otherwise create it:

```bash
git worktree list | grep poc-nats-reports
```

If the worktree exists at `../poc-nats-reports`:
- Reuse it. Run `git -C ../poc-nats-reports fetch origin poc`.

If no worktree exists:

```bash
git fetch origin poc
git worktree add --detach ../poc-nats-reports origin/poc
```

Create a branch for this status report:

```bash
cd ../poc-nats-reports
git checkout -B status-changes/$(date +%Y-%m-%d-%H%M) origin/poc
```

Ensure directories exist:

```bash
mkdir -p ../poc-nats-reports/reports/cumulative/
mkdir -p ../poc-nats-reports/reports/state/
```

## 2. COMPUTE TIME WINDOW

```bash
HOURS=<extracted hours or 24>
CUTOFF=$(date -u -v-${HOURS}H +%Y-%m-%dT%H:%M:%SZ)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOW_ET=$(TZ='America/New_York' date '+%Y-%m-%d %I:%M %p ET')
```

If `--since` was provided, use that as `CUTOFF` instead.

Print:

```
=== NATS PoC Status Changes Report ===
Window: $CUTOFF → $NOW ($HOURS hours)
```

## 3. COLLECT STATUS DATA

### 3a. PRs merged in the time window

```bash
gh pr list --base poc --state merged --json number,title,headRefName,mergedAt --jq "[.[] | select(.mergedAt > \"$CUTOFF\")]"
```

### 3b. PRs opened in the time window

```bash
gh pr list --base poc --state open --json number,title,headRefName,createdAt --jq "[.[] | select(.createdAt > \"$CUTOFF\")]"
```

### 3c. PRs closed (not merged) in the time window

```bash
gh pr list --base poc --state closed --json number,title,mergedAt,closedAt --jq "[.[] | select(.mergedAt == null and .closedAt > \"$CUTOFF\")]"
```

### 3d. Step progress snapshot

Read the current step-progress data. Try the local poll state first, fall back to committed state:

```bash
cat ../poc-nats-reports/.step-progress-local.json 2>/dev/null || git show origin/poc:reports/state/step-progress.json
```

### 3e. Previous status changelog

Read the existing changelog to compare against (for detecting step deltas):

```bash
cat ../poc-nats-reports/reports/cumulative/status-changelog.md 2>/dev/null || echo ""
```

### 3f. Cross-repo PR live status

Read the PR classification file:

```bash
cat ../poc-nats-reports/reports/state/pr-classification.json 2>/dev/null || git show origin/poc:reports/state/pr-classification.json 2>/dev/null || echo '{"cross_repo_prs":[]}'
```

For each entry in `cross_repo_prs` where `pr` is not null:

```bash
gh pr view <pr> --repo <repo> --json number,title,state,url,mergedAt --jq '{number,title,state,url,mergedAt}' 2>/dev/null || echo '{}'
```

Compare live state against stored status. Record transitions (e.g., `planned → open`, `open → merged`).

### 3g. PR classification for path tagging

For each PR discovered in 3a-3c, classify by path using the same rules as report-poll:

1. Check manual entries in `pr-classification.json` → `prs[N]`
2. Match `headRefName` against `auto_classify_rules` patterns
3. Default to `shared`

## 4. COMPUTE STEP DELTAS

Parse the step-progress data. For each step, compute what changed:

- If any newly merged PRs (from 3a) appear in a step's `open_prs` list, they transitioned from open → merged
- Recalculate `completion_pct` for affected steps: `merged / (merged + open) * 100`
- Record deltas: `{ step, name, previous_pct, current_pct, delta }`

**Important**: Do NOT write back to step-progress files. This command is read-only for state files — it only appends to the changelog.

## 5. BUILD AND WRITE CHANGELOG ENTRY

Read the existing changelog:

```bash
cat ../poc-nats-reports/reports/cumulative/status-changelog.md 2>/dev/null || echo ""
```

If the file doesn't exist or is empty, create it with the header:

```markdown
# NATS PoC — Status Changelog

Append-only log of status changes. Each entry covers changes detected in a configurable time window.

---
```

Append a new entry at the END of the file (after the last `---` separator).

**Writing style**: Write like you're updating your team on Slack. Be conversational, specific, and highlight what actually matters. Lead with the narrative, not the data. No tables — use bullet lists and prose. Call out what moved the needle and what's blocked.

Use this format:

```markdown

## <NOW_ET>

<A 2-4 sentence narrative paragraph summarizing what happened in plain English. Lead with the most important change. Mention specific PR numbers inline. If nothing notable happened, say so honestly — e.g., "Quiet day — mostly housekeeping merges, no progress on open steps." If there were significant changes, be specific: "We closed out Step 2 today — PR #60 was the last piece, fixing the EBS CSI driver and SCP tags. Infrastructure is fully deployed.">

**What merged** (<count> PRs in the last <HOURS>h):
<for each merged PR, one bullet — group related PRs together with a short narrative intro if 4+>
- **#<N>** — <title> _(<PATH>)_
<if none: "Nothing merged in this window.">

<if any PRs opened, include this section:>
**Newly opened:**
<for each opened PR>
- **#<N>** — <title> _(<PATH>)_

<if any PRs closed without merging, include this section:>
**Closed without merging:**
<for each closed PR>
- **#<N>** — <title>

<if any step deltas exist, include this section:>
**Step progress:**
<for each step with a delta, one bullet in natural language>
- Step <N> (<name>): <prev>% → <curr>% — <brief explanation of what caused the change>

**Where things stand now:**
<List ONLY steps that are in_progress or have changed. Skip completed steps unless they just completed in this window. Skip not_started steps. For each:>
- **Step <N> (<name>)** — <completion_pct>% — <one line on what's done and what remains>
<Also include cross-repo status here, woven in naturally with the step they relate to, e.g.:>
  - Waiting on infra-terraform#1295 (Spectrum config) — still in review
  - infra-kubernetes#2897 (Flux CRD) — merged

---
```

Write the updated file using the Write tool.

## 6. PRINT SLACK MESSAGE

Print a Slack-ready message to the terminal that the user can copy-paste directly. Use Slack mrkdwn formatting (`*bold*`, `_italic_`, `•` bullets). This is the primary output of the command.

```
*NATS PoC Update* — <NOW_ET>

<Same narrative paragraph from the changelog entry, but adapted for Slack. Keep it to 2-3 sentences. Be specific about what matters.>

*What merged* (<count> PRs):
<for each merged PR>
• #<N> — <title>

<if step deltas exist:>
*Progress:*
<for each step delta>
• Step <N> (<name>): <prev>% → <curr>%

*Where things stand:*
<for each in-progress step, one bullet>
• Step <N> (<name>) — <pct>%<if cross-repo dependency, mention it inline>

<if cross-repo transitions happened:>
*Cross-repo:*
• <repo>#<pr> — <transition description>

_Changelog: reports/cumulative/status-changelog.md_
```

## 7. COMMIT AND PR

```bash
cd ../poc-nats-reports
git add reports/cumulative/status-changelog.md
git commit -m "Status changes: $(date +%Y-%m-%d) ${HOURS}h window"
git push -u origin $(git branch --show-current)
gh pr create --base poc --title "Status changes: $(date +%Y-%m-%d) ${HOURS}h window" --body "$(cat <<'EOF'
## Summary

Appended a new status changelog entry covering the last HOURS hours.

### Changes Detected
- Merged PRs: <count>
- Opened PRs: <count>
- Closed PRs: <count>
- Step deltas: <count>
- Cross-repo transitions: <count>

See `reports/cumulative/status-changelog.md` for the full entry.
EOF
)"
```

Print the PR URL.

## 8. RETURN TO MAIN DIRECTORY

```bash
cd /Users/abhinav.lele/src/limebike/poc-code-yellow-nats
```

**Do NOT remove the worktree.** It persists for future runs and for report-poll.

## Notes

- This command is **idempotent within a time window** — running it twice in the same hour will produce two entries, both capturing the same window. Each entry is a snapshot, not a diff from the previous entry.
- The changelog file is **append-only**. Never modify or remove existing entries.
- This command does NOT update `.poll-state.json` or `.step-progress-local.json`. It is read-only for state files.
- Cross-repo PR data uses the same `pr-classification.json` source as report-poll.
- Path classification uses the same branch-to-step mapping and auto-classify rules as report-poll.
