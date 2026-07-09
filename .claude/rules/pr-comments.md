---
paths:
  - "**/*.md"
  - "**/CHANGELOG*"
  - "**/RELEASE_NOTES*"
---

# PR comments, commit messages, PR descriptions — no LLM tells

Write as if a human engineer typed it. Trust the diff to speak for itself.

## Length caps (hard)

- **Commit message body: ≤ 3 sentences.** One paragraph. If the change
  needs more explanation, it belongs in an ADR / design doc / PR body,
  not the commit trailer. The subject line already summarizes; the body
  is only for the *why* that isn't in the diff.
- **PR / review comment: ≤ 3 sentences** unless a tradeoff needs
  explaining, in which case a second paragraph is fine.
- **Bulleted lists in commit bodies: don't.** Prose sentences read like
  human intent; a bullet enumeration of "what changed" reads like
  machine output and duplicates the diff.

A verbose commit body is the strongest LLM tell — humans don't write
four-paragraph commit messages for one-file fixes. If you find yourself
wanting to explain the design tradeoff, the doc-line reference, the
regression test rationale, and the follow-up in the same commit body,
STOP: pick the one thing that's not in the diff and cut the rest.

## Forbidden phrasings

- Announcing future actions: "Updating the description now", "Filing as a
  follow-up", "I'll thread a comment", "Captured as deferred", "I'll send
  a small follow-up". If the action is needed, do it — don't promise it
  in the comment.
- Tidy "Fixed / Discussed / Pending" header structure with bolded
  category labels. That's machine prose.
- Sycophantic openings: "You're right", "Good catch", "Great question",
  "Considered —", "Interesting point". Lead with the substance.
- Restating what the diff already shows. A line-level commit speaks for
  itself; comment only when you have something the diff does NOT say
  (rationale, tradeoff considered, deferred follow-up with a reason).
- Multi-paragraph polished essays where 2 sentences would do.
- Exhaustive bullet enumerations of what changed.

## Required shape

- Short prose. 1-3 sentences per thread is normal.
- Specific line refs (`file.go:123`) instead of "in the function I changed".
- Lead with the substance, not preamble.
- One paragraph if the reply is just an acknowledgement; two if there's a
  tradeoff to explain.

## When to comment at all

- A reviewer pointed at something the diff DOESN'T resolve on its own:
  why a tradeoff was taken, why a deferred fix is acceptable, what
  invariant the fix encodes.
- A reviewer raised a concern you DIDN'T fix: explain why (one paragraph
  with the tradeoff).
- The reviewer was wrong: politely correct, with a line ref to the
  evidence.

Don't comment to:
- Confirm "fixed in commit X" — the commit linkage shows it.
- List every change in the diff — the diff is right there.
- Acknowledge praise.

## Smell test

When in doubt about whether a phrase sounds AI-generated, cut it. Read the
draft out loud — if it sounds like a service-desk email or a chatbot, it
probably is. Human reviewers write short, specific, imperfect prose, with
occasional sentence fragments. Mirror that.

## Markdown output — no horizontal rules

Never insert `---` (Markdown horizontal rules) between sections of a PR
description, comment, review body, or any generated report. Use headings
(`##`, `###`) to separate sections. `---` renders as visual clutter and
does not translate cleanly when the body is pasted into Google Docs,
Confluence, or Slack. The one place `---` is required is the frontmatter
fence at the top of the file itself (`---\nname: ...\n---`).
