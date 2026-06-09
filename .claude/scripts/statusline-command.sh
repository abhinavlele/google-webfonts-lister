#!/usr/bin/env bash
# Claude Code status line script
# Two-tone powerline theme: dark slate + lime green

input=$(cat)

# --- Model ---
model=$(echo "$input" | jq -r '.model.display_name // "unknown"')

# --- Current directory (basename) ---
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
dir=$(basename "$cwd")

# --- MCP servers (from multiple sources) ---
all_mcps=""

# 1. From ~/.claude/mcp-config.json
mcp_config="$HOME/.claude/mcp-config.json"
if [[ -f "$mcp_config" ]]; then
  all_mcps=$(jq -r '.mcpServers | keys[]' "$mcp_config" 2>/dev/null)
fi

# 2. From project settings.local.json - extract unique server names from mcp__ permissions
proj_settings="${cwd}/.claude/settings.local.json"
if [[ -f "$proj_settings" ]]; then
  proj_mcps=$(jq -r '.permissions.allow[]? // empty' "$proj_settings" 2>/dev/null | grep '^mcp__' | sed 's/^mcp__//;s/__.*//' | sort -u)
  if [[ -n "$proj_mcps" ]]; then
    all_mcps=$(printf "%s\n%s" "$all_mcps" "$proj_mcps")
  fi
fi

# Deduplicate, sort, and join
mcp_count=0
if [[ -n "$all_mcps" ]]; then
  mcp_names=$(echo "$all_mcps" | grep -v '^$' | sort -u | tr '\n' ',' | sed 's/,$//')
  mcp_count=$(echo "$all_mcps" | grep -v '^$' | sort -u | wc -l | tr -d ' ')
fi

# --- Theme: two-tone (dark slate + lime green) ---
sep=""

# Color A: dark slate
a_fg="\033[38;5;255m"
a_bg="\033[48;5;239m"
a_sep="\033[38;5;239m"

# Color B: lime green
b_fg="\033[38;5;235m"
b_bg="\033[48;5;76m"
b_sep="\033[38;5;76m"

bold="\033[1m"
reset="\033[0m"

# --- Build output ---
# Layout: Model [A] → Directory [B] → MCP [A, if any] → Autoresearch [B, if any]
# (Token / context-percent segment intentionally omitted — Claude Code already
#  shows it in its own indicator below the prompt; this avoided duplicate and
#  occasionally divergent numbers.)
out=""

# Segment 1: Model [A]
out+="${a_bg}${a_fg}${bold}  ${model} "
out+="${reset}${a_sep}${b_bg}${sep}${reset}"

# Segment 2: Directory [B]
out+="${b_bg}${b_fg}${bold}  ${dir} "

last_bg="b"

if [[ "$mcp_count" -gt 0 ]]; then
  # Segment 3: MCP [A]
  out+="${reset}${b_sep}${a_bg}${sep}${reset}"
  out+="${a_bg}${a_fg}${bold}  ${mcp_count} mcp: ${mcp_names} "
  last_bg="a"
fi

# --- Optional segment: Autoresearch ---
ar_status_script="$HOME/.claude/scripts/autoresearch/status.sh"
ar_line=""
if [[ -x "$ar_status_script" ]]; then
  ar_line=$("$ar_status_script" 2>/dev/null || true)
fi

if [[ -n "$ar_line" ]]; then
  if [[ "$last_bg" == "b" ]]; then
    out+="${reset}${b_sep}${a_bg}${sep}${reset}"
    out+="${a_bg}${a_fg}${bold} ${ar_line} "
    out+="${reset}${a_sep}${sep}${reset}"
  else
    out+="${reset}${a_sep}${b_bg}${sep}${reset}"
    out+="${b_bg}${b_fg}${bold} ${ar_line} "
    out+="${reset}${b_sep}${sep}${reset}"
  fi
else
  if [[ "$last_bg" == "b" ]]; then
    out+="${reset}${b_sep}${sep}${reset}"
  else
    out+="${reset}${a_sep}${sep}${reset}"
  fi
fi

printf "%b\n" "$out"
