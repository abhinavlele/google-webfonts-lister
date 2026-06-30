#!/usr/bin/env bash
# Run `codex` with a fully isolated HOME.
#
# WHY: codex persists session/memory state (rollout-*.jsonl + memories_*.sqlite /
# state_*.sqlite under ~/.codex) that `codex review` can replay — returning the
# findings of an UNRELATED repo's prior scan ("wrong-repo" bug). That store lives
# under the real ~/.codex and is NOT governed by CODEX_HOME, so setting only
# CODEX_HOME does not fix it. Redirecting HOME itself to a fresh empty dir (with
# just auth copied in) gives codex no prior session to replay. Confirmed fix.
#
# Usage: codex-isolated.sh review -m gpt-5.5 --base main
#        codex-isolated.sh exec   -m gpt-5.5 --sandbox read-only "<prompt>"
# Any codex subcommand + args are passed straight through. Runs in the current
# working directory (codex reviews the repo you're in).
set -u

REAL_HOME="${HOME:?HOME must be set}"
ISO="$(mktemp -d)"
mkdir -p "$ISO/.codex"
# Carry only what codex needs to authenticate + know the model/provider — NOT the
# sessions/memory/state that cause the replay.
cp "$REAL_HOME/.codex/auth.json"   "$ISO/.codex/" 2>/dev/null || true
cp "$REAL_HOME/.codex/config.toml" "$ISO/.codex/" 2>/dev/null || true

cleanup() { rm -rf "$ISO"; }
trap cleanup EXIT INT TERM

# Pin the working directory. WHY: `codex review` has no --cd flag and, when run
# from an ambiguous cwd, can resolve the repo to a DIFFERENT local checkout of
# the same git remote (observed: a second clone under another user's home, at a
# stale HEAD — the "wrong-repo" replay). A fresh HOME does not fix this because
# the drift is by working directory, not by session state. Set CODEX_ISO_CWD to
# the intended repo root and the wrapper cd's there before invoking codex, so
# `review`/`exec` operate on exactly that checkout. Defaults to the current
# directory (no behavior change for callers that don't set it).
WORKDIR="${CODEX_ISO_CWD:-$PWD}"
if [ ! -d "$WORKDIR" ]; then
  echo "codex-isolated: CODEX_ISO_CWD is not a directory: $WORKDIR" >&2
  exit 3
fi
cd "$WORKDIR" || { echo "codex-isolated: cannot cd to $WORKDIR" >&2; exit 3; }

# `env -i` drops the inherited environment so no stray CODEX_*/HOME leaks in;
# we re-add only PATH/TERM/LANG (+ HOME → the isolated dir) plus a minimal
# allowlist of auth/network vars so env-var-authenticated setups (API key,
# corporate proxy) still work. CODEX_HOME is deliberately NOT passed through —
# pointing codex back at the real state store would resurrect the replay bug
# this wrapper exists to prevent.
PASS_VARS=(OPENAI_API_KEY OPENAI_BASE_URL OPENAI_ORG_ID CODEX_API_KEY
           HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy)
PASS_ENV=()
for v in "${PASS_VARS[@]}"; do
  if [ -n "${!v:-}" ]; then PASS_ENV+=("$v=${!v}"); fi
done

env -i \
  HOME="$ISO" \
  PATH="$PATH" \
  TERM="${TERM:-xterm}" \
  LANG="${LANG:-en_US.UTF-8}" \
  ${PASS_ENV[@]+"${PASS_ENV[@]}"} \
  codex "$@"
rc=$?
exit "$rc"
