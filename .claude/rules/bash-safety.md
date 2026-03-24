# Bash Command Safety

## Safe Patterns
- Redirect stderr: `command 2>&1 | head -20`
- Check before delete: `ls -la target_dir/` then `rm specific_file.txt`
- Timeout long commands: `timeout 30s ./script.sh`
- Use absolute paths instead of `cd && command`

## Avoid
- `rm -rf` without explicit user confirmation
- Unbounded output (always pipe to `head` or `tail`)
- Heredocs for file creation (use Write tool)
- `python3 << 'SCRIPT'` patterns (use Write tool + execute)
- Process termination (`pkill`, `kill -9`) without confirmation
- Compound bash: never chain `cd && git` — use `-C` flag or absolute paths
