# Review Scope Discipline — Fix What Was Asked, File the Rest

Standing doctrine for `codex-reviewer`, `security-reviewer`, and any future
review-gate agent. A review round's job is to make the CURRENT change
correct and safe, not to converge on zero findings against every
hardening idea the diff's neighborhood suggests. Letting "keep finding
things" and "keep fixing things" run as the same loop, with no exit other
than exhausting the round cap, is how a one-function bug fix (tmux plugins
not installing on a fresh bootstrap) grew to ~680 lines and 15 commits
chasing tmux XDG config precedence, `/etc/tmux.conf` source-file
indirection, a legacy plugin-declaration option, branch-suffixed plugin
specs, and CI path-filter changes — none of which the original request
needed to be correct, and none of which a personal single-user dotfiles
bootstrap script materially benefits from defending against.

## The rule

Classify every finding before acting on it:

- **In scope — fix it, same as today.** The finding is a bug, vulnerability,
  or correctness gap reachable through NORMAL use of the change as
  originally requested — the stated task, not a hypothetical variant or
  extension of it. Fix inline, this round, exactly as now.

- **Out of scope — file it, don't fix it.** The finding is a hardening
  idea, a defense-in-depth improvement, or handling for a threat/scenario
  beyond what the requested change needs to be correct and safe (a config
  precedence edge case nobody asked to support, a system file this repo
  doesn't own, a legacy input format the current change doesn't touch,
  an attacker model requiring access the user's own machine already
  grants more directly). Do not expand the diff to cover it, and do not
  let it block convergence. Name it in the round's returned status line
  instead — see "What filing looks like" below.

The test: **"does the ORIGINAL request fail, misbehave, or become unsafe
without this fix?"** Yes → in scope. "No, but it would be more robust" →
out of scope, and say so explicitly rather than quietly fixing it anyway,
which is how scope creep hides — a finding fixed without comment looks
identical to one that was load-bearing all along, and the next round has
no way to tell them apart.

Apply that test to the DIFF, not to the feature's headline. Anything the
change itself introduces — a new unbounded input, a secret or infra
detail in a new log line, a new path around an auth check — is in scope
by definition: the change ships that flaw, so the change is unsafe
without the fix, whether or not the requested feature "still works."
Only findings about surface the diff did NOT create — pre-existing code,
neighboring config, a hypothetical future caller — are eligible for
deferral at all. Every example in the incident above is that kind.

## Why this doesn't weaken the open-ended audit

`security-reviewer`'s "Mandatory open-ended audit pass" stays exactly as
it is: keep looking beyond only what the parent named, because
targeted-only passes have missed real findings before (see that rule for
the incident it exists to prevent). What changes is what happens AFTER
something is found. Coverage and scope are different failure modes —
audit widely, then file (don't fix) whatever the classification above
puts out of scope. This rule closes the second failure without reopening
the first.

## Priority triage within scope

In-scope findings still get a priority check before fixing: **likelihood**
(normal operation vs. a rare multi-condition coincidence) × **risk** (data
loss, security bypass vs. cosmetic/self-correcting). HIGH — fix inline,
same round. LOW — defer like an out-of-scope finding (`deferred:` in the
status line); don't let it block round-cap convergence. This caps a loop
that keeps surfacing real-but-vanishingly-unlikely edge cases in its own
mechanism — each defensible alone, unbounded together.

## What filing looks like

Review-gate agents don't carry `gh issue create` in their tool allowlist,
and it is separately gated by the PR Writer Gate besides — they are not
positioned to open issues themselves. List out-of-scope findings by short
title in the round's returned status line instead, e.g.:

```
clean: marker stamped at abc123; deferred: "validate /etc/tmux.conf
plugin declarations", "handle legacy @tpm_plugins option"
```

Filing the actual issue (`gh issue create`, through `pr-comment-writer`)
is the orchestrating agent's job, or the human operator's — whichever is
driving. A deferred finding that's dropped on the floor because no one
files it is a known, visible gap; a deferred finding silently fixed
anyway is scope creep with a clean marker attached.
