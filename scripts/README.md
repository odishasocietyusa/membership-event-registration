# Claude Code Session Report

A utility script to generate usage reports after Claude Code conversations.

## What It Reports

- **Model Used**: Which Claude model powered your session (Opus/Sonnet/Haiku 4.5)
- **Token Usage**:
  - Input tokens (your messages + context)
  - Output tokens (Claude's responses)
  - Cache tokens (prompt caching for efficiency)
  - Total context used (% of 200K window)
- **Cost Estimate**: Calculated based on Claude API pricing
- **Current Directory**: Project path for the conversation
- **Timing**: Start and end timestamps
- **Conversation File**: Path to the JSONL conversation transcript

## Usage

### Option 1: Quick Run (Bash Wrapper)

```bash
# From project root
./scripts/session-report.sh
```

### Option 2: Python Script (More Control)

```bash
# From project root (auto-detects current project)
python3 scripts/claude-session-report.py

# Or specify a different project
python3 scripts/claude-session-report.py --project-path /path/to/project
```

### Option 3: Add Shell Alias (Recommended)

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
alias claude-report='python3 $(pwd)/scripts/claude-session-report.py'
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

Now you can run from anywhere:
```bash
claude-report
```

## Example Output

```
======================================================================
📊 CLAUDE CODE SESSION REPORT
======================================================================

📁 Session Information:
   Current Directory: /Users/you/Documents/code/membership-event-registration
   Messages: 2469

🤖 Model:
   Model ID: claude-sonnet-4-5-20250929
   Model Family: claude-sonnet-4-5

📈 Token Usage:
   Input Tokens:   8,492
   Output Tokens:  2,356
   Cache Tokens:   86,760,239 (prompt caching)
   Total Tokens:   10,848
   Context Used:   5.4% of 200K window

💰 Cost Estimate:
   Input Cost:  $0.0255
   Output Cost: $0.0353
   Total Cost:  $0.0608

⏱️  Timing:
   Started: 2026-02-13T00:07:57.258Z
   Ended:   2026-02-18T04:21:32.758Z

📄 Conversation File:
   /Users/you/.claude/projects/-Users-you-Documents-code-membership-event-registration/3700541b-8a9f-4533-80ab-84a3f062b58a.jsonl

======================================================================

💾 Report saved to: .claude-session-report.txt
```

## Output Files

The script creates a `.claude-session-report.txt` file in your project root with the same information. This file is automatically ignored by git (see `.gitignore`).

## Pricing Reference

Current Claude 4.5 pricing (per million tokens):

| Model | Input | Output |
|-------|-------|--------|
| Opus 4.5 | $15.00 | $75.00 |
| Sonnet 4.5 | $3.00 | $15.00 |
| Haiku 4.5 | $0.25 | $1.25 |

*Note: Prices are estimates and may not include prompt caching discounts. Check [Anthropic's pricing page](https://www.anthropic.com/pricing) for current rates.*

## How It Works

1. Reads conversation history from `~/.claude/projects/`
2. Finds the most recent conversation for your project
3. Parses JSONL format to extract:
   - Model information
   - Token usage from Claude API responses
   - Timestamps and metadata
4. Calculates costs based on model pricing
5. Generates formatted report

## Troubleshooting

**"Could not find conversation file"**
- Make sure you're in the correct project directory
- Check that you have Claude Code session data in `~/.claude/projects/`

**"Could not parse conversation file"**
- The conversation file may be corrupted
- Try running the script after a fresh conversation

## Requirements

- Python 3.9+ (uses `Path | None` type hint syntax)
- Claude Code CLI (for conversation history)

## Credits

Created to track Claude Code usage across projects. Inspired by the need to monitor AI development costs.
