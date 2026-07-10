# UX Doctrine — Interface Self-Review

Standing doctrine for every change that touches a user interface, in every
repo. The deterministic complement is the `a11y` and `design-system`
rule-packs (abhinav-lele-claude-code-toolkit plugin `invariants/packs/`, opt in via `.invariants.json`
`"extends"`) — they catch the *mechanical* failures: a hrefless anchor, a
hardcoded hex, a positive tabindex. This file covers the half a regex cannot
see: missing states, weak copy, broken focus order, inconsistent layout.

The same failure classes recur and are only caught by deliberate review:
happy-path-only screens (no empty/loading/error state), inaccessible custom
controls, untranslated strings, and "looks done in the mock, breaks on real
data." Run `/selfreview` before committing UI changes.

## Part A — Interface self-review checklist (complete BEFORE committing)

For every UI change, write out (PR description, commit message, or working
notes — it must exist somewhere reviewable):

1. **Every state, not just the happy one.** For each new view, list its
   states and confirm each is designed, not defaulted: **empty** (no data
   yet / first run), **loading** (skeleton or spinner, no layout jump),
   **error** (a recoverable message with a next action, not a blank screen
   or raw stack), **partial** (some data, some failed), and **success**. A
   screen that only renders the success state is unfinished.

2. **Keyboard and screen-reader path.** Name how a keyboard-only user
   reaches and operates every interactive element you added: it is in the
   tab order, has a visible focus ring, has an accessible name (label /
   aria-label / text), and activates on Enter/Space. Custom controls
   (anything that isn't a native `<button>`/`<a>`/`<input>`) state their
   `role` and the keys they handle. Focus moves sensibly after the action
   (into an opened dialog, back to the trigger on close — and the dialog
   traps focus).

3. **Real data, not mock data.** State what happens at the boundaries the
   mock hid: the longest realistic string (does it truncate or overflow?),
   zero items, one item, thousands of items (is the list virtualized /
   paginated?), a missing avatar/image, an RTL or accented locale, a very
   narrow and a very wide viewport. "It looked fine with three short rows"
   is not coverage.

4. **Feedback and reversibility.** Every action that mutates state gives
   immediate feedback (optimistic update, spinner, or toast) and, for
   destructive or hard-to-undo actions, a confirmation or an undo. The user
   is never left guessing whether a click registered. Disable or guard
   double-submission.

5. **Consistency with the system.** New UI reuses existing components,
   spacing scale, typography, and color tokens rather than introducing
   one-off values (the `design-system` pack flags the literals; you confirm
   the *intent* — that a genuinely new pattern is justified and not a
   reinvention of something that already exists).

6. **Copy is for the user.** Labels, errors, and empty states are written in
   the user's language, not the system's: no raw error codes or exception
   text surfaced, no "undefined"/"NaN"/"[object Object]" leaking through,
   user-facing strings localized (or routed through i18n) rather than
   hardcoded. Error messages say what happened AND what to do next.

A UI change is not ready to commit until every item above has an answer.

## Part B — Universal UX invariant categories

These apply to every interface; the mechanically-checkable instances are
enforced by the `a11y` / `design-system` packs, the rest are review items.

- **Perceivable.** Text alternatives for non-text content (alt, title,
  aria-label). Color is never the *only* carrier of meaning. Text meets
  contrast (4.5:1 body, 3:1 large) — a regex can't measure this; check it.
- **Operable.** Everything reachable and operable by keyboard alone. No
  keyboard trap (except an intentional, escapable modal). Visible focus.
  Touch targets large enough (~44px). No motion that can't be reduced
  (respect `prefers-reduced-motion`).
- **Understandable.** Predictable behavior, consistent navigation, labels
  tied to inputs, inline and recoverable form validation (say which field
  and why), no surprise context changes on focus.
- **Robust / responsive.** Works across viewport sizes and zoom to 200%,
  degrades gracefully without JS where it reasonably can, no fixed pixel
  layouts that clip real content.
- **Stateful & honest.** Loading, empty, error, and offline states all
  exist and are reachable. Latency is acknowledged. Failures are surfaced
  to the user, never swallowed into a blank or frozen UI.
- **Consistent.** One design system: shared components, one spacing/type/
  color scale, tokens over literals. New patterns are deliberate additions
  to the system, not local divergences.
