#!/usr/bin/env python3
"""
Agent Session Telemetry Report
Consolidates usage, token counts, and cost reports for both Claude Code and Antigravity (agy) CLI.

Usage:
    python scripts/agent-session-report.py
    python scripts/agent-session-report.py --project-path /path/to/project
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime
import argparse

# Pricing models (per million tokens)
PRICING = {
    # Claude models
    'claude-opus-4-5': {'input': 15.00, 'output': 75.00},
    'claude-sonnet-4-5': {'input': 3.00, 'output': 15.00},
    'claude-haiku-4-5': {'input': 0.25, 'output': 1.25},
    'claude-opus': {'input': 15.00, 'output': 75.00},
    'claude-sonnet': {'input': 3.00, 'output': 15.00},
    'claude-haiku': {'input': 0.25, 'output': 1.25},
    # Gemini models (agy)
    'gemini-1.5-pro': {'input': 1.25, 'output': 5.00},
    'gemini-1.5-flash': {'input': 0.075, 'output': 0.30},
    'gemini-3.5-flash': {'input': 0.075, 'output': 0.30},
    'gemini-flash': {'input': 0.075, 'output': 0.30},
    'gemini-pro': {'input': 1.25, 'output': 5.00},
    'unknown': {'input': 1.00, 'output': 4.00}
}

def get_model_family(model_id: str) -> str:
    """Extract model family from full model ID."""
    if not model_id:
        return 'unknown'
    m_lower = model_id.lower()
    if 'opus' in m_lower:
        return 'claude-opus'
    elif 'sonnet' in m_lower:
        return 'claude-sonnet'
    elif 'haiku' in m_lower:
        return 'claude-haiku'
    elif 'gemini-1.5-pro' in m_lower or 'gemini-pro' in m_lower:
        return 'gemini-pro'
    elif 'gemini-3.5-flash' in m_lower or 'gemini-1.5-flash' in m_lower or 'flash' in m_lower:
        return 'gemini-flash'
    else:
        return 'unknown'

def find_claude_conversation(project_path: str) -> Path | None:
    """Find the most recent Claude conversation JSONL file for the project."""
    claude_dir = Path.home() / '.claude' / 'projects'
    if not claude_dir.exists():
        return None

    project_path_normalized = str(Path(project_path).resolve())
    most_recent_file = None
    most_recent_time = 0

    for project_dir in claude_dir.iterdir():
        if not project_dir.is_dir():
            continue

        for jsonl_file in project_dir.glob('*.jsonl'):
            try:
                with open(jsonl_file, 'r') as f:
                    for _ in range(10):
                        line = f.readline()
                        if not line:
                            break
                        try:
                            data = json.loads(line)
                            if 'cwd' in data and data['cwd'] == project_path_normalized:
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

def parse_claude_conversation(jsonl_file: Path) -> dict | None:
    """Parse Claude conversation file and extract usage metrics."""
    messages = []
    try:
        with open(jsonl_file, 'r') as f:
            for line in f:
                try:
                    messages.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except (IOError, OSError):
        return None

    if not messages:
        return None

    model_id = None
    total_input_tokens = 0
    total_output_tokens = 0
    total_cache_tokens = 0

    for msg in messages:
        if 'message' in msg:
            m_data = msg['message']
            if 'model' in m_data and not model_id:
                model_id = m_data['model']
            if 'usage' in m_data:
                usage = m_data['usage']
                total_input_tokens += usage.get('input_tokens', 0)
                total_output_tokens += usage.get('output_tokens', 0)
                total_cache_tokens += usage.get('cache_creation_input_tokens', 0)
                total_cache_tokens += usage.get('cache_read_input_tokens', 0)

    # Resolve timestamps
    first_time = messages[0].get('timestamp', '')
    last_time = messages[-1].get('timestamp', '')

    return {
        'agent': 'Claude Code',
        'model_id': model_id or 'claude-3-5-sonnet',
        'input_tokens': total_input_tokens,
        'output_tokens': total_output_tokens,
        'cache_tokens': total_cache_tokens,
        'message_count': len(messages),
        'start_time': first_time,
        'end_time': last_time,
        'file': str(jsonl_file)
    }

def find_agy_conversations(project_path: str) -> list[Path]:
    """Find all agy conversation folders that match this project."""
    brain_dir = Path.home() / '.gemini' / 'antigravity-cli' / 'brain'
    if not brain_dir.exists():
        return []

    project_path_normalized = str(Path(project_path).resolve())
    matching_transcripts = []

    for conv_dir in brain_dir.iterdir():
        if not conv_dir.is_dir():
            continue
        transcript_file = conv_dir / '.system_generated' / 'logs' / 'transcript.jsonl'
        if not transcript_file.exists():
            continue

        # Check if the transcript contains references to this project path
        try:
            with open(transcript_file, 'r') as f:
                content_sample = f.read(8000) # Read sample to check project match
                if project_path_normalized in content_sample:
                    matching_transcripts.append(transcript_file)
        except (IOError, OSError):
            continue

    # Sort matching transcripts by modification time, most recent first
    matching_transcripts.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return matching_transcripts

def parse_agy_conversation(transcript_file: Path) -> dict | None:
    """Parse agy transcript file and estimate token usage based on characters."""
    steps = []
    try:
        with open(transcript_file, 'r') as f:
            for line in f:
                try:
                    steps.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except (IOError, OSError):
        return None

    if not steps:
        return None

    # Estimate tokens
    # Output: planning responses, thoughts, generated files
    # Input: user inputs, system/tool outputs + cumulative history context
    total_input_chars = 0
    total_output_chars = 0
    
    cumulative_history_chars = 0
    model_id = "gemini-3.5-flash"  # Default fallback
    
    start_time = steps[0].get('created_at', '')
    end_time = steps[-1].get('created_at', '')

    for step in steps:
        step_type = step.get('type', '')
        source = step.get('source', '')

        # Model is generating output
        if source == 'MODEL':
            # Collect thoughts and actions
            thinking = step.get('thinking', '')
            tool_calls = json.dumps(step.get('tool_calls', []))
            output_chunk = len(thinking) + len(tool_calls)
            total_output_chars += output_chunk
            
            # The input context at this point is the cumulative history
            total_input_chars += cumulative_history_chars
            
            # Update cumulative history with the model's response
            cumulative_history_chars += output_chunk
            
            # Retrieve model settings changes if any
            content = step.get('content', '')
            if 'model' in content.lower():
                model_id = "gemini-3.5-flash"
        else:
            # System, user, or tool outputs are added to the input context
            content = step.get('content', '')
            input_chunk = len(content)
            cumulative_history_chars += input_chunk
            
    # Standard character-to-token approximation (~4 chars per token)
    input_tokens = int(total_input_chars / 4)
    output_tokens = int(total_output_chars / 4)

    return {
        'agent': 'Antigravity (agy)',
        'model_id': model_id,
        'input_tokens': input_tokens,
        'output_tokens': output_tokens,
        'cache_tokens': 0, # Gemini caching not tracked natively in transcript
        'message_count': len(steps),
        'start_time': start_time,
        'end_time': end_time,
        'file': str(transcript_file)
    }

def print_agent_report(metrics: dict, project_path: Path) -> str:
    """Format and display telemetry for a single agent session."""
    model_family = get_model_family(metrics['model_id'])
    pricing = PRICING.get(model_family, PRICING['unknown'])

    input_cost = (metrics['input_tokens'] / 1_000_000) * pricing['input']
    output_cost = (metrics['output_tokens'] / 1_000_000) * pricing['output']
    total_cost = input_cost + output_cost

    lines = []
    lines.append("┌" + "─" * 68 + "┐")
    lines.append(f"│ 🤖 Agent: {metrics['agent']:-<48} │")
    lines.append("├" + "─" * 68 + "┤")
    lines.append(f"│  Model ID:     {metrics['model_id']:<47} │")
    lines.append(f"│  Model Family: {model_family:<47} │")
    lines.append(f"│  Steps/Logs:   {metrics['message_count']:<47} │")
    lines.append("├" + "─" * 68 + "┤")
    lines.append(f"│  Input Tokens:  {metrics['input_tokens']:,} (Approx)" if metrics['agent'] != 'Claude Code' else f"│  Input Tokens:  {metrics['input_tokens']:,}")
    lines.append(f"│  Output Tokens: {metrics['output_tokens']:,} (Approx)" if metrics['agent'] != 'Claude Code' else f"│  Output Tokens: {metrics['output_tokens']:,}")
    if metrics['cache_tokens'] > 0:
        lines.append(f"│  Cache Tokens:  {metrics['cache_tokens']:,} (Prompt Caching)")
    lines.append("├" + "─" * 68 + "┤")
    lines.append(f"│  Input Cost:   ${input_cost:.4f} (${pricing['input']:.2f}/M)                  │")
    lines.append(f"│  Output Cost:  ${output_cost:.4f} (${pricing['output']:.2f}/M)                 │")
    lines.append(f"│  Total Cost:   ${total_cost:.4f}                                     │")
    if metrics['start_time']:
        lines.append("├" + "─" * 68 + "┤")
        lines.append(f"│  Start Time:   {metrics['start_time'][:19]:<47} │")
        lines.append(f"│  End Time:     {metrics['end_time'][:19]:<47} │")
    lines.append("└" + "─" * 68 + "┘")
    return "\n".join(lines), total_cost

def main():
    parser = argparse.ArgumentParser(
        description='Generate agent usage, token, and cost reports'
    )
    parser.add_argument(
        '--project-path',
        type=str,
        default=os.getcwd(),
        help='Path to the project directory (default: current directory)'
    )
    args = parser.parse_args()
    project_path = Path(args.project_path).resolve()

    print("=" * 70)
    print("📊 UNIFIED AI AGENT SESSION TELEMETRY")
    print("=" * 70)
    print(f"📁 Target Repository: {project_path}\n")

    reports = []
    grand_total_cost = 0.0

    # 1. Look for Claude conversation
    claude_file = find_claude_conversation(str(project_path))
    if claude_file:
        claude_metrics = parse_claude_conversation(claude_file)
        if claude_metrics:
            report_str, cost = print_agent_report(claude_metrics, project_path)
            reports.append(report_str)
            grand_total_cost += cost
    else:
        print("ℹ️  No active Claude Code session found in standard registry.")

    # 2. Look for agy conversations
    agy_transcripts = find_agy_conversations(str(project_path))
    if agy_transcripts:
        # Load the most recent agy conversation
        agy_metrics = parse_agy_conversation(agy_transcripts[0])
        if agy_metrics:
            report_str, cost = print_agent_report(agy_metrics, project_path)
            reports.append(report_str)
            grand_total_cost += cost
    else:
        print("ℹ️  No active Antigravity (agy) session found in standard registry.")

    if not reports:
        print("\n❌ No telemetry logs could be found for either agent on this project.")
        sys.exit(0)

    # Print the reports
    for rep in reports:
        print(rep)
        print()

    print("=" * 70)
    print(f"💰 COMBINED SESSION COST ESTIMATE: ${grand_total_cost:.4f}")
    print("=" * 70)

    # Save report output to disk
    report_file = project_path / '.agent-session-report.txt'
    with open(report_file, 'w') as f:
        f.write("=" * 70 + "\n")
        f.write("📊 UNIFIED AI AGENT SESSION TELEMETRY\n")
        f.write("=" * 70 + "\n")
        f.write(f"📁 Target Repository: {project_path}\n\n")
        f.write("\n\n".join(reports))
        f.write(f"\n\n======================================================================\n")
        f.write(f"💰 COMBINED SESSION COST ESTIMATE: ${grand_total_cost:.4f}\n")
        f.write(f"======================================================================\n")

    print(f"\n💾 Saved telemetry report to: {report_file}")

if __name__ == '__main__':
    main()
