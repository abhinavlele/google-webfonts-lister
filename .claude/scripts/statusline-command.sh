#!/usr/bin/env bash
# Claude Code status line script
# Two-tone powerline theme: dark slate + lime green

input=$(cat)

# --- Model ---
model=$(echo "$input" | jq -r '.model.display_name // "unknown"')

# --- Current directory (basename) ---
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
dir=$(basename "$cwd")

# --- Token usage ---
usage=$(echo "$input" | jq '.context_window.current_usage')
if [[ "$usage" != "null" && -n "$usage" ]]; then
  input_tok=$(echo "$usage" | jq '.input_tokens')
  cache_create=$(echo "$usage" | jq '.cache_creation_input_tokens')
  cache_read=$(echo "$usage" | jq '.cache_read_input_tokens')
  total_tok=$(( input_tok + cache_create + cache_read ))
  ctx_size=$(echo "$input" | jq '.context_window.context_window_size')
  pct=$(( total_tok * 100 / ctx_size ))
  if (( total_tok >= 1000 )); then
    tok_display="${pct}% · $(( total_tok / 1000 ))k"
  else
    tok_display="${pct}% · ${total_tok}"
  fi
else
  tok_display="0%"
fi

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

# Color A: dark slate (model, tokens)
a_fg="\033[38;5;255m"
a_bg="\033[48;5;239m"
a_sep="\033[38;5;239m"

# Color B: lime green matching screenshot (directory, MCP)
b_fg="\033[38;5;235m"
b_bg="\033[48;5;76m"
b_sep="\033[38;5;76m"

bold="\033[1m"
reset="\033[0m"

# --- Build output ---
out=""

# Segment 1: Model [dark]
out+="${a_bg}${a_fg}${bold}  ${model} "
out+="${reset}${a_sep}${b_bg}${sep}${reset}"

# Segment 2: Directory [green]
out+="${b_bg}${b_fg}${bold}  ${dir} "

# Segment 3: Tokens [dark]
out+="${reset}${b_sep}${a_bg}${sep}${reset}"
out+="${a_bg}${a_fg}${bold} 󰊪 ${tok_display} "

if [[ "$mcp_count" -gt 0 ]]; then
  # Segment 4: MCP [green]
  out+="${reset}${a_sep}${b_bg}${sep}${reset}"
  out+="${b_bg}${b_fg}${bold}  ${mcp_count} mcp: ${mcp_names} "
  out+="${reset}${b_sep}${sep}${reset}"
else
  out+="${reset}${a_sep}${sep}${reset}"
fi

printf "%b\n" "$out"
