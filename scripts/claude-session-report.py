#!/usr/bin/env python3
"""
Claude Code Session Report
Generates a usage report after a Claude Code conversation session.

Usage:
    python scripts/claude-session-report.py
    python scripts/claude-session-report.py --project-path /path/to/project
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime
import argparse

# Claude API pricing (per million tokens)
PRICING = {
    'claude-opus-4-5': {
        'input': 15.00,
        'output': 75.00
    },
    'claude-sonnet-4-5': {
        'input': 3.00,
        'output': 15.00
    },
    'claude-haiku-4-5': {
        'input': 0.25,
        'output': 1.25
    }
}

def get_model_family(model_id: str) -> str:
    """Extract model family from full model ID."""
    if 'opus' in model_id.lower():
        return 'claude-opus-4-5'
    elif 'sonnet' in model_id.lower():
        return 'claude-sonnet-4-5'
    elif 'haiku' in model_id.lower():
        return 'claude-haiku-4-5'
    else:
        return 'unknown'

def find_conversation_file(project_path: str) -> Path | None:
    """Find the most recent conversation JSONL file for the project."""
    # Claude stores conversations in ~/.claude/projects/
    claude_dir = Path.home() / '.claude' / 'projects'

    if not claude_dir.exists():
        return None

    # Normalize project path for comparison
    project_path_normalized = str(Path(project_path).resolve())

    # Find matching project directory
    most_recent_file = None
    most_recent_time = 0

    for project_dir in claude_dir.iterdir():
        if not project_dir.is_dir():
            continue

        # Check all JSONL files in the directory
        for jsonl_file in project_dir.glob('*.jsonl'):
            # Check if this file is for our project by reading first few lines
            try:
                with open(jsonl_file, 'r') as f:
                    # Read first 10 lines to find a message with cwd
                    for _ in range(10):
                        line = f.readline()
                        if not line:
                            break
                        try:
                            data = json.loads(line)
                            # Check if the working directory matches (cwd is at root level)
                            if 'cwd' in data:
                                if data['cwd'] == project_path_normalized:
                                    # Get file modification time
                                    mtime = jsonl_file.stat().st_mtime
                                    if mtime > most_recent_time:
                                        most_recent_time = mtime
                                        most_recent_file = jsonl_file
                                    break
                        except json.JSONDecodeError:
                            continue
            except (IOError, OSError):
                continue

    return most_recent_file

def parse_conversation(jsonl_file: Path) -> dict:
    """Parse conversation JSONL file and extract metrics."""
    messages = []

    with open(jsonl_file, 'r') as f:
        for line in f:
            try:
                message = json.loads(line)
                messages.append(message)
            except json.JSONDecodeError:
                continue

    if not messages:
        return None

    # Extract model from messages (it's in message.model for assistant messages)
    model_id = None
    for msg in messages:
        if 'message' in msg and 'model' in msg['message']:
            model_id = msg['message']['model']
            break

    # Count tokens (from usage data in message.usage)
    total_input_tokens = 0
    total_output_tokens = 0
    total_cache_tokens = 0

    for msg in messages:
        if 'message' in msg and 'usage' in msg['message']:
            usage = msg['message']['usage']
            total_input_tokens += usage.get('input_tokens', 0)
            total_output_tokens += usage.get('output_tokens', 0)
            # Add cache tokens
            total_cache_tokens += usage.get('cache_creation_input_tokens', 0)
            total_cache_tokens += usage.get('cache_read_input_tokens', 0)

    # Get conversation metadata
    first_msg = messages[0]
    last_msg = messages[-1]

    # Get cwd from first message with cwd field
    cwd = 'Unknown'
    for msg in messages:
        if 'cwd' in msg:
            cwd = msg['cwd']
            break

    start_time = first_msg.get('timestamp', 'Unknown')
    end_time = last_msg.get('timestamp', 'Unknown')

    return {
        'model_id': model_id,
        'input_tokens': total_input_tokens,
        'output_tokens': total_output_tokens,
        'cache_tokens': total_cache_tokens,
        'total_tokens': total_input_tokens + total_output_tokens,  # Cache tokens don't count toward context
        'message_count': len(messages),
        'cwd': cwd,
        'start_time': start_time,
        'end_time': end_time,
        'conversation_file': str(jsonl_file)
    }

def calculate_cost(model_id: str, input_tokens: int, output_tokens: int) -> dict:
    """Calculate the cost of the conversation."""
    model_family = get_model_family(model_id or '')

    if model_family not in PRICING:
        return {
            'input_cost': 0,
            'output_cost': 0,
            'total_cost': 0,
            'error': f'Unknown model: {model_id}'
        }

    pricing = PRICING[model_family]

    input_cost = (input_tokens / 1_000_000) * pricing['input']
    output_cost = (output_tokens / 1_000_000) * pricing['output']
    total_cost = input_cost + output_cost

    return {
        'input_cost': input_cost,
        'output_cost': output_cost,
        'total_cost': total_cost,
        'error': None
    }

def format_report(metrics: dict, cost: dict) -> str:
    """Format the report as a readable string."""
    report = []
    report.append("=" * 70)
    report.append("📊 CLAUDE CODE SESSION REPORT")
    report.append("=" * 70)
    report.append("")

    # Session Info
    report.append("📁 Session Information:")
    report.append(f"   Current Directory: {metrics['cwd']}")
    report.append(f"   Messages: {metrics['message_count']}")
    report.append("")

    # Model Info
    report.append("🤖 Model:")
    model_display = metrics['model_id'] if metrics['model_id'] else 'Unknown'
    model_family = get_model_family(metrics['model_id'] or '')
    report.append(f"   Model ID: {model_display}")
    report.append(f"   Model Family: {model_family}")
    report.append("")

    # Token Usage
    report.append("📈 Token Usage:")
    report.append(f"   Input Tokens:   {metrics['input_tokens']:,}")
    report.append(f"   Output Tokens:  {metrics['output_tokens']:,}")
    report.append(f"   Cache Tokens:   {metrics['cache_tokens']:,} (prompt caching)")
    report.append(f"   Total Tokens:   {metrics['total_tokens']:,}")

    # Calculate context percentage (assuming 200k context window)
    context_pct = (metrics['total_tokens'] / 200_000) * 100
    report.append(f"   Context Used:   {context_pct:.1f}% of 200K window")
    report.append("")

    # Cost
    report.append("💰 Cost Estimate:")
    if cost['error']:
        report.append(f"   ⚠️  {cost['error']}")
    else:
        report.append(f"   Input Cost:  ${cost['input_cost']:.4f}")
        report.append(f"   Output Cost: ${cost['output_cost']:.4f}")
        report.append(f"   Total Cost:  ${cost['total_cost']:.4f}")
    report.append("")

    # Timestamps
    if metrics['start_time'] != 'Unknown' and metrics['end_time'] != 'Unknown':
        report.append("⏱️  Timing:")
        report.append(f"   Started: {metrics['start_time']}")
        report.append(f"   Ended:   {metrics['end_time']}")
        report.append("")

    # File Location
    report.append("📄 Conversation File:")
    report.append(f"   {metrics['conversation_file']}")
    report.append("")

    report.append("=" * 70)

    return "\n".join(report)

def main():
    parser = argparse.ArgumentParser(
        description='Generate Claude Code session usage report'
    )
    parser.add_argument(
        '--project-path',
        type=str,
        default=os.getcwd(),
        help='Path to the project directory (default: current directory)'
    )

    args = parser.parse_args()
    project_path = args.project_path

    # Find conversation file
    print(f"🔍 Searching for conversation file for: {project_path}")
    conversation_file = find_conversation_file(project_path)

    if not conversation_file:
        print("❌ Could not find conversation file for this project.")
        print(f"   Project path: {project_path}")
        print(f"   Claude directory: {Path.home() / '.claude' / 'projects'}")
        sys.exit(1)

    print(f"✅ Found conversation: {conversation_file.name}\n")

    # Parse conversation
    metrics = parse_conversation(conversation_file)

    if not metrics:
        print("❌ Could not parse conversation file.")
        sys.exit(1)

    # Calculate cost
    cost = calculate_cost(
        metrics['model_id'],
        metrics['input_tokens'],
        metrics['output_tokens']
    )

    # Generate and print report
    report = format_report(metrics, cost)
    print(report)

    # Optionally save to file
    output_file = Path(project_path) / '.claude-session-report.txt'
    with open(output_file, 'w') as f:
        f.write(report)

    print(f"\n💾 Report saved to: {output_file}")

if __name__ == '__main__':
    main()
