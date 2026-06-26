# OKR Device Identity JIRA Sync

Synchronize JIRA issue statuses with the actual state of the NATS PoC project.
Covers both epics: SEC-2622 (Edge Layer) and SEC-2623 (Vehicle Security / Device Identity).

## Instructions

You MUST follow this exact sequence. Do NOT skip steps or auto-execute transitions.

### Step 1: COLLECT

Gather state from all three sources in parallel:

**A. JIRA state** — Fetch all children of both epics:
```
JQL: parent = SEC-2622 ORDER BY key ASC  (edge layer)
JQL: parent = SEC-2623 ORDER BY key ASC  (vehicle security)
```
Fields: summary, status, assignee, description
Also fetch: SEC-2622 and SEC-2623 themselves (epic-level status)

**Also fetch subtasks of in-scope SEC-2622 tasks.** Some tasks (e.g., SEC-2663) have subtasks (SEC-2665 through SEC-2680) that are not direct children of SEC-2622 and will not appear in the parent query. Fetch them with:
```
JQL: parent in (SEC-2660, SEC-2661, SEC-2662, SEC-2663, SEC-2664) ORDER BY key ASC
```
Fields: summary, status, assignee, parent
Include these subtask results in the state map so Step 2's subtask drift check has data to compare against.

**B. Local state** — Read:
- `docs/scaling-plan.md` — the JIRA Cross-Reference table and execution tables
- `reports/state/pr-classification.json` — if it exists, for PR-to-step mappings

**C. GitHub state** — For each PR referenced in the scaling plan or known branches:
```bash
gh pr list --repo limebike/poc-code-yellow-nats --state all --base poc --json number,title,state,mergedAt,headRefName --limit 50
```

**D. Sync map** — Read the sync map from:
`~/.claude/projects/-Users-abhinav-lele-src-limebike-poc-code-yellow-nats/jira-sync-map.json`

### Step 2: DETECT DRIFT

Compare JIRA status against reality. Apply these rules in order:

**Status resolution rules (local/GitHub -> JIRA):**

| Signal | JIRA should be | Evidence needed |
|--------|----------------|-----------------|
| All PRs for step merged + deployed/tested | Done (transition 31) | PR URLs + merge dates |
| All PRs for step merged, not yet deployed | Done (transition 31) | PR URLs (PoC code merge = done for PoC) |
| PR open or in review | Code Review (transition 3) | PR URL |
| Work started, no PR yet | In Progress (transition 21) | Branch name or commit evidence |
| Blocked by dependency | Blocked (transition 2) | What it's blocked on |
| No work started | To Do (transition 11) | -- |
| Explicitly deferred | To Do (no change) | Add "Deferred" note in comment |

**Bidirectional drift detection:**

1. **JIRA ahead of local** — A JIRA issue exists under SEC-2622 or SEC-2623 that has NO entry in the sync map or scaling-plan.md cross-reference table. This means someone added work in JIRA that local tracking doesn't know about. Flag these as "NEW IN JIRA — needs local tracking entry".

2. **Local ahead of JIRA** — A local step exists (in scaling-plan.md) that has no corresponding JIRA issue. Flag these as "NEW LOCALLY — needs JIRA issue creation".

3. **Iteration/improvement items** — If a JIRA issue's description or summary has changed significantly since last sync (compare against sync map's `last_summary`), flag as "JIRA UPDATED — review for local impact". These represent new ideas or scope changes added in JIRA.

4. **Status mismatch** — JIRA status doesn't match what the evidence says. These are the primary changes to propose.

5. **Subtask drift** — Some SEC-2622 tasks have subtasks (e.g., SEC-2663 has SEC-2674 through SEC-2680). Check subtask status too and flag mismatches.

### Step 3: PRESENT CHANGES

Print a clear summary grouped by change type:

```
## JIRA Sync: Proposed Changes

### Status Changes (N items)

| # | JIRA | Summary | Current | Proposed | Reason |
|---|------|---------|---------|----------|--------|
| 1 | SEC-XXXX | ... | To Do | In Progress | PR #167 open |
| 2 | SEC-XXXX | ... | In Progress | Done | PR #165 merged 2026-03-14 |

Draft comments:
  1. SEC-XXXX: "Moved to In Progress — PR #167 (feat/oauth-bike-simulator) opened targeting poc branch."
  2. SEC-XXXX: "Completed — PR #165 (feat/ec2-test-fleet-a2a3) merged. EC2 fleet module and orchestration scripts are in the poc branch."

### New in JIRA (N items) — not tracked locally
| JIRA | Summary | Status | Suggested local step |
...

### New Locally (N items) — no JIRA issue
| Local Step | Summary | Suggested JIRA epic |
...

### JIRA Description Changes (N items) — review for scope changes
| JIRA | Summary | What changed |
...

### No Changes Needed (N items)
| JIRA | Summary | Status | Reason |
...
```

Then ask: **"Apply these changes? (yes/no/edit)"**
- **yes** — Execute all proposed status transitions and comments
- **no** — Abort, no changes made
- **edit** — User specifies which items to include/exclude by number

### Step 4: EXECUTE

For each approved change:

1. **Status transitions** — Use `mcp__atlassian__transitionJiraIssue` with the transition ID:
   - To Do: `11`
   - In Progress: `21`
   - Code Review: `3`
   - Done: `31`
   - Deployed in Production: `4`
   - Blocked: `2`

2. **Comments** — Use `mcp__atlassian__addCommentToJiraIssue` with markdown format. Comments should be factual and reference evidence (PR numbers, merge dates, test results). Keep them concise.

3. **New JIRA issues** — If approved, use `mcp__atlassian__createJiraIssue` under the appropriate epic (SEC-2622 for edge layer, SEC-2623 for device identity). New issues under SEC-2623 should use `parent: SEC-2623` (not the track-level parent like SEC-2885) since JIRA hierarchy only allows Epic -> Task nesting.

4. **Sprint and assignee for In Progress items** — After creating or transitioning issues to In Progress, ensure they are:
   - **Assigned** to Abhinav Lele (`712020:54c88bcc-581b-44d3-aa7b-7edfe8474318`)
   - **Added to the current active sprint** — Find the sprint ID by reading `customfield_10118` from an existing In Progress issue (e.g., SEC-2681), then set it on the new/transitioned issues via `mcp__atlassian__editJiraIssue` with `fields: {"customfield_10118": <sprint_id>}`. The sprint field is `customfield_10118` (NOT `customfield_10020`).

5. **Update sync map** — After all JIRA changes succeed, update the sync map JSON with:
   - New `last_synced` timestamp
   - Updated `jira_status` for changed issues
   - New entries for any created issues
   - Updated `last_summary` for issues whose descriptions were checked

6. **Update scaling-plan.md** — If new JIRA issues were created, add them to the cross-reference table. If new local steps are needed (from JIRA additions), add them to the appropriate track.

### Step 5: REPORT

Print a summary of what was done:
```
## Sync Complete

Transitions: N applied
Comments: N added
New JIRA issues: N created
Local tracking updates: N
Errors: N (list any failures)

Next sync recommended after: [next expected PR merge or milestone]
```

## JIRA Project Details

- Cloud ID: `limebike.atlassian.net`
- Project: `SEC`
- Epics:
  - `SEC-2622` — OKR/Services Security (edge layer evaluation)
  - `SEC-2623` — OKR/Vehicle Security (device identity PoC)
- Assignee account ID: `712020:54c88bcc-581b-44d3-aa7b-7edfe8474318`
- Repo: `limebike/poc-code-yellow-nats` (branch: `poc`)

## Transition ID Reference

| Name | ID | When to use |
|------|----|-------------|
| To Do | 11 | No work started, or reverting |
| In Progress | 21 | Work started, branch exists |
| Code Review | 3 | PR open, awaiting review |
| Done | 31 | PR merged, step complete |
| Deployed in Production | 4 | Deployed and validated in environment |
| Blocked | 2 | Waiting on external dependency |
| Won't Fix | 7 | Descoped or abandoned |
| Duplicate | 8 | Covered by another issue |

## Filtering unrelated SEC-2622 children

SEC-2622 contains non-NATS tasks (factory migration, connectivity, etc.). Only sync these JIRA keys under SEC-2622:
- SEC-2660, SEC-2661, SEC-2662, SEC-2663, SEC-2664
- And their subtasks (SEC-2665 through SEC-2680)

Ignore all other SEC-2622 children (SEC-2305, SEC-2333, SEC-2338, SEC-2440, SEC-2632, SEC-2644, SEC-2646).
