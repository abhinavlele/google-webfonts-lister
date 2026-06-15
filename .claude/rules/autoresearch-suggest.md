# Proactive Autoresearch — When to Suggest

Standing guidance, every repo: recognize when an optimization is better run as
an empirical `/autoresearch` loop (edit → benchmark → keep-or-revert on MAD
confidence) than as hand-tuning, and offer it — but only when it genuinely
fits. The model makes this call mid-conversation; this is not a hook.

## Suggest `/autoresearch` only when ALL hold

1. **Quantitative metric** to move — latency / throughput / p99, bundle or
   binary size, memory, accuracy or eval score, token or $ cost.
2. **Repeatably measurable** by a command — an existing bench / test / eval, or
   one writable in a few minutes.
3. **Empirical win** — several plausible candidate edits, no single
   obviously-correct fix; success is judged by the number moving, not by
   correctness.
4. The metric **matters to the stated goal** — not a vanity number.

## How to suggest

One line: name the metric, the direction (min/max), and how it's measured —
e.g. "This is an autoresearch fit: minimize p99 latency, measured by
`npm run bench`. Want me to spin up `/autoresearch`?" If no measurement command
exists, offer to **write the benchmark harness first** — that is the usual
blocker. Never auto-start the loop; the user opts in.

## Do NOT suggest it for

- Correctness bugs or a single known, deterministic fix — just do it.
- Anything with **no measurable target**.
- When building the measurement would cost more than the optimization is worth.

In these cases say plainly that autoresearch doesn't fit — never force it.
