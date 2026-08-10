---
paths:
  - "**/ship.md"
  - "**/codex-reviewer.md"
  - "**/security-reviewer.md"
---

# Atomic Timeboxed Sprints — Cap Orchestrator-Driven Review Rounds

Standing doctrine for anyone (command, agent, or human-driven session)
delegating to `codex-reviewer` / `security-reviewer`. The sub-agent's own
5-round hard cap is a backstop, not a target — an orchestrator that always
lets it run to that cap turns every review gate into an open-ended
session, even after the priority triage in `review-scope-discipline.md`
should already be trimming most rounds to nothing.

## The rule

`codex-reviewer` / `security-reviewer` each own their entire review loop
inside ONE sub-agent invocation — internally up to 5 rounds, one final
one-line status back to the caller. The caller can't see or interrupt
those internal rounds, and each sub-agent's own exit rule already breaks
out the instant a round's findings are all LOW-priority/out-of-scope — so
that internal loop needs no change and this cap doesn't apply inside it.
A "round" for this doctrine is instead a full invocation — a spawn of the
sub-agent, not a sub-round inside one.

Consecutive invocations are visible at the CALLER's re-spawn boundary:
`/ship`'s codex-reviewer ↔ security-reviewer reconvergence loop (1c/1c2,
re-spawning whichever reviewer's marker went stale) is where this applies.
Whoever drives that loop tracks it:

> After 2 consecutive invocations whose returned status carries only
> LOW-priority `deferred:` findings (per the likelihood/risk triage) — no
> invocation in between made a fix commit for a HIGH finding — stop
> re-spawning. Adjudicate the deferred list yourself (fix or file), run
> exactly one final verification invocation, then converge. If that
> adjudication commits a fix of its own it stales BOTH markers, and one
> invocation can no longer restore them — budget a full codex-reviewer →
> security-reviewer pair at the new HEAD instead. An invocation
> that still produced a HIGH-finding fix commit never counts toward this
> streak, no matter how narrow that finding was — that's forward progress,
> not a stall.

Tighter than, and separate from, either sub-agent's own 5-round internal
hard cap — that cap only prevents infinite looping inside one invocation,
not a slow drip of narrow real findings spread across repeated
invocations.

## Why

Closing issue #134 took roughly 10 rounds across three separate
codex-reviewer invocations before this rule existed, each round finding a
real, if progressively narrower, edge case in the very serialization
mechanism being shipped. The priority triage rule (`deferred:` for
LOW-priority findings) fixed convergence going forward; this rule fixes
how long a review loop keeps chasing a narrowing tail before it stops.
