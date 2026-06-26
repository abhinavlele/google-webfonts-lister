# Epic Status Report

Generate an executive-friendly project status readout from one or more JIRA epics. The output should be something you can read aloud in a leadership meeting or paste into Slack for a VP audience.

**Usage:** `/epic-status PROJ-123` or `/epic-status PROJ-123 PROJ-456 PROJ-789`

**Argument:** $ARGUMENTS (one or more JIRA epic keys, space-separated)

## Instructions

You MUST follow this exact sequence.

### Step 1: PARSE ARGUMENTS

Extract all JIRA epic keys from: `$ARGUMENTS`

If no arguments provided, ask the user for the epic key(s) and stop.

Validate each key matches the pattern `[A-Z]+-\d+`. If invalid, inform the user and stop.

### Step 2: COLLECT DATA

For each epic key, fetch data in parallel:

**A. Epic details** — Use `mcp__atlassian__getJiraIssue` for each epic:
- Cloud ID: `limebike.atlassian.net`
- Fields: summary, status, priority, assignee, description, created, updated
- Response format: markdown

**B. Child issues** — Use `mcp__atlassian__searchJiraIssuesUsingJql` for each epic:
```
JQL: parent = <EPIC_KEY> ORDER BY status ASC, priority DESC, key ASC
```
- Fields: summary, status, issuetype, priority, assignee, created, updated
- Max results: 100
- Response format: markdown

**C. Sub-epics** — From the child issues, identify any that are type "Epic" or "Sub-Epic". For each sub-epic found, recursively fetch ITS children using the same JQL pattern:
```
JQL: parent = <SUB_EPIC_KEY> ORDER BY status ASC, priority DESC, key ASC
```

### Step 3: ANALYZE

Understand the story behind the data:
1. Group tickets into logical workstreams/themes based on their summaries
2. Identify what has shipped, what's in motion, and what's coming next
3. Note any blockers or risks worth calling out

### Step 4: PRESENT EXECUTIVE READOUT

Write a narrative status update suitable for a VP-level audience. Conversational but precise. No JIRA jargon, no tables, no progress bars. Think "what would I say if someone asked me how this project is going?"

Use this format:

```
## <Epic Summary>
_Status as of <today's date> — <done>/<total> items complete (<percent>%)_

**Bottom line:** <One sentence. Is this on track, behind, or blocked? What's the headline?>

**What we've shipped:**
<2-4 bullets in plain English. Describe outcomes, not tasks. "We stood up the CI/CD pipeline for LimeGuard" not "Created CI/CD pipeline for limeguard ECR deployment." Group related work together. No ticket keys in the prose.>

**What's in progress:**
<2-4 bullets describing active workstreams. Name the owner naturally — "Jonib is building..." not "Assignee: Jonib." Focus on what's happening and why it matters.>

**Highlights:**
<1-3 bullets — wins, momentum, or things going better than expected. Think "what would make leadership feel good about this project?" Examples: "Shipped the full OAuth stack in under two weeks" or "Zero auth failures across 100K connections.">

**Lowlights:**
<1-3 bullets — blockers, risks, misses, or things going slower than expected. Be honest and specific about impact. If nothing is concerning, say "Nothing blocking us right now." Examples: "12 critical pentest findings still unowned after two weeks" or "Cross-repo DNS dependency blocking our highest-visibility deliverable.">

**What's next:**
<1-2 sentences on the upcoming work. Give a sense of scope — "We have 22 items queued covering X, Y, and Z" not a list of tickets.>
```

### Tone and Style

- **Conversational but professional** — write like you're briefing your skip-level, not filing a report
- **Outcomes over activities** — "We shipped the container deployment pipeline" not "Created ECR repository and CI/CD pipeline tasks"
- **Name people naturally** — "Saurabh is leading the architecture review" not "Assignee: Saurabh Sharma"
- **No ticket keys in the prose** — they break the reading flow. Leadership doesn't need SEC-2463
- **No tables, no progress bars, no status breakdowns** — pure narrative
- **Keep it scannable** — short bullets, bold section headers, no walls of text
- **Be honest about risks** — "We have a blocked item holding up CI review" not "one item is in blocked status"
- **Total length: aim for 15-25 lines** — enough to be useful, short enough to actually read
- If multiple epics are provided, use a horizontal rule between them

### Step 5: ASK FOR ADDITIONAL CONTEXT

After presenting the readout, ask:

> **Anything to add or correct?** (additional context, missed details, different framing — or "looks good" to finalize)

If the user provides additional context:
1. Do NOT re-fetch JIRA data — reuse the already-collected data
2. Incorporate the user's input into the narrative (add details, adjust tone, correct facts, reframe sections)
3. Regenerate the full readout with the new information woven in naturally
4. Ask again for further adjustments — repeat until the user says it looks good

This loop allows the user to layer in knowledge that JIRA doesn't capture — verbal updates, context from meetings, nuance about priorities, or corrections to how work is characterized.

## JIRA Configuration

- Cloud ID: `limebike.atlassian.net`
- Response format: `markdown` (always)
