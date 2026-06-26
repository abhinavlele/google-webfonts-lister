# OKR Device Identity — Project Command Hub

Orchestrator for the NATS Device Identity PoC project. Reads current project state and helps route to the right action.

## Instructions

### Step 1: QUICK STATE CHECK

Gather state concisely (no deep fetches — just enough to assess what's relevant):

```bash
# Recent commits on poc
git log --oneline -5 origin/poc

# Open PRs
gh pr list --repo limebike/poc-code-yellow-nats --base poc --state open --json number,title,headRefName --limit 10

# Recently merged PRs (last 7 days)
gh pr list --repo limebike/poc-code-yellow-nats --base poc --state merged --json number,title,mergedAt --limit 10
```

Read the JIRA sync map (if it exists) for last sync time:
`~/.claude/projects/-Users-abhinav-lele-src-limebike-poc-code-yellow-nats/jira-sync-map.json`

### Step 2: PRESENT DASHBOARD

Print a brief project status and available actions:

```
## OKR Device Identity — Status

Last JIRA sync: <timestamp or "never">
Open PRs: N
Recently merged: N (last 7d)
Branch: poc

## Available Actions

1. /okr-device-jira-sync  — Sync JIRA statuses with local tracking
   Last run: <date>. Use when: PRs merged, work started/completed, or to check for JIRA-side changes.

2. /report-poll            — Poll for new merges and generate reports
   Use when: PRs have merged since last poll and you need updated Level 1-9 reports.

3. /report-status-changes  — Generate Slack-ready status update
   Use when: Preparing a status update for Slack (default: last 24h).

4. /report-deep-dive       — Full report regeneration from scratch
   Use when: Reports are stale or you want a complete refresh across all merge history.

5. /deliberate             — Structured reasoning before implementation
   Use when: Planning the next Track A/B/C step, architectural decision, or ambiguous requirement.

6. /ralph-loop             — Iterative code quality loop
   Use when: Code is written and needs quality review before PR submission.

## Suggested Next Action

<Based on state, suggest the most relevant action. Examples:>
<- PRs merged since last JIRA sync → suggest /okr-device-jira-sync>
<- PRs merged since last report-poll → suggest /report-poll>
<- Nothing new → suggest /deliberate for planning next step>
<- About to start coding → suggest /deliberate then /ralph-loop after>
```

### Step 3: ROUTE

Wait for the user to pick an action (by number or name). Then tell them to run the corresponding slash command directly — do NOT try to inline-execute another command's logic.

If the user describes what they want to do instead of picking a number, map it to the right command:
- "sync jira" / "update jira" / "check jira" → `/okr-device-jira-sync`
- "generate reports" / "check for merges" → `/report-poll`
- "status update" / "slack update" → `/report-status-changes`
- "plan next step" / "what should I work on" → `/deliberate`
- "review my code" / "check quality" → `/ralph-loop`
- "refresh all reports" → `/report-deep-dive`
- "start working on <step>" → suggest `/deliberate` first, then implementation, then `/ralph-loop`

If the user asks about something not covered by these commands (e.g., "create a PR", "deploy", "run tests"), handle it directly without routing to a sub-command.

## Project Context

- Repo: `limebike/poc-code-yellow-nats` (branch: `poc`)
- JIRA epics: SEC-2622 (edge layer), SEC-2623 (vehicle security)
- Scaling plan: `docs/scaling-plan.md`
- Sync map: `~/.claude/projects/-Users-abhinav-lele-src-limebike-poc-code-yellow-nats/jira-sync-map.json`
