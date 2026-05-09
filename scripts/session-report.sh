#!/bin/bash
# Quick wrapper to run Claude Code session report
# Usage: ./scripts/session-report.sh

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Run the Python script with the current directory
python3 "$SCRIPT_DIR/claude-session-report.py" --project-path "$PROJECT_ROOT"
