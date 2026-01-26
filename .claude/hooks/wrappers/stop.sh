#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="$(dirname "$SCRIPT_DIR")"
exec "$SCRIPT_DIR/run_background.sh" "$HOOKS_DIR/stop.py"
