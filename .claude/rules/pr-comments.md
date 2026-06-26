---
paths:
  - "**/*.md"
  - "**/CHANGELOG*"
  - "**/RELEASE_NOTES*"
---

# PR comments, commit messages, PR descriptions — no LLM tells

Write as if a human engineer typed it. Trust the diff to speak for itself.

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
