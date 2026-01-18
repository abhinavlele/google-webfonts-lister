#!/usr/bin/env python3
"""
Claude-powered pattern consolidation and configuration cleanup for Claude Code.
Supports multiple modes:
- full: Pattern analysis + redundancy detection + agent consolidation
- patterns-only: Only analyze patterns from scratchpad
- cleanup-only: Only detect and remove redundancy
"""

import os
import sys
import json
import argparse
from pathlib import Path

try:
    import requests
except ImportError:
    print("Warning: requests module not available, dry-run only mode", file=sys.stderr)


def find_pattern_files(scratchpad_dir):
    """Find all pattern files in the scratchpad directory"""
    patterns = []
    scratchpad_path = Path(scratchpad_dir)

    # Look for markdown files that contain patterns or learnings
    for pattern_file in scratchpad_path.rglob("*.md"):
        if any(keyword in pattern_file.name.lower()
               for keyword in ['pattern', 'learning', 'mistake', 'observation', 'note']):
            patterns.append(pattern_file)

    return patterns


def find_agent_files(agents_dir):
    """Find all agent definition files"""
    agents_path = Path(agents_dir)
    return list(agents_path.glob("*.md"))


def find_shared_files(shared_dir):
    """Find all shared configuration files"""
    shared_path = Path(shared_dir)
    return list(shared_path.glob("*.md"))


def read_file_safe(file_path):
    """Safely read a file and return its content"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}", file=sys.stderr)
        return None


def call_claude_api(prompt, api_key, max_tokens=8000):
    """Call Claude API to analyze patterns and generate updates"""
    try:
        import requests
    except ImportError:
        print("Error: requests module required for Claude API calls", file=sys.stderr)
        sys.exit(1)

    url = "https://api.anthropic.com/v1/messages"

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }

    data = {
        "model": "claude-opus-4-5-20251101",
        "max_tokens": max_tokens,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=120)
        response.raise_for_status()

        result = response.json()
        if 'content' in result and len(result['content']) > 0:
            return result['content'][0]['text']
        else:
            raise Exception("No content in Claude API response")

    except Exception as e:
        print(f"Error calling Claude API: {e}", file=sys.stderr)
        sys.exit(1)


def build_patterns_prompt(current_claude_md, patterns_content):
    """Build prompt for pattern analysis mode"""
    return f"""You are an expert software engineering assistant specializing in Claude Code configuration management.

Your task is to analyze patterns and learnings from development sessions and intelligently update a CLAUDE.md configuration file.

## Current CLAUDE.md:
```markdown
{current_claude_md}
```

## Patterns and Learnings from LLM Scratchpad:
{chr(10).join(patterns_content)}

## Instructions:

1. **Analyze the patterns**: Look for:
   - Common mistakes that should be avoided
   - Successful patterns that should be reinforced
   - New agent types or capabilities that should be documented
   - Configuration improvements based on real usage

2. **Update Strategy**:
   - Keep CLAUDE.md essential and focused on WHEN to use agents
   - Add new agent selection rules based on observed patterns
   - Update critical rules if patterns show consistent issues
   - Add auto-run agent triggers if patterns show repeated manual tasks

3. **Maintain Architecture**:
   - Keep the existing agent delegation philosophy
   - Don't add implementation details - those belong in agent files
   - Focus on task routing and agent selection
   - Preserve the essential, minimal structure

4. **Output Requirements**:
   - Return ONLY the updated CLAUDE.md content
   - No explanations or comments outside the markdown
   - If no meaningful updates are needed, return the original content
   - Ensure all existing functionality is preserved

Generate the updated CLAUDE.md:"""


def build_cleanup_prompt(current_claude_md, agents_content, shared_content):
    """Build prompt for cleanup/redundancy detection mode"""
    return f"""You are an expert software engineering assistant specializing in Claude Code configuration cleanup and optimization.

Your task is to analyze the Claude Code configuration for redundancy and propose consolidations.

## Current CLAUDE.md:
```markdown
{current_claude_md}
```

## Agent Files:
{chr(10).join(agents_content)}

## Shared Files:
{chr(10).join(shared_content)}

## Analysis Tasks:

### 1. Detect Redundant Content
Identify content that is duplicated across multiple files:
- Autonomous operation sections (appears in every agent)
- Completion assessment handoff sections (appears in every agent)
- Critical rules (duplicated between CLAUDE.md and critical-rules.md)

### 2. Identify Agent Overlap
Find agents with >50% similar responsibilities:
- security-auditor vs infra-security-engineer (both cover cloud security, compliance, vulnerability assessment)
- git-worktree-expert vs ci-fixer-parallel (both document worktree patterns)

### 3. Propose Consolidations
For each redundancy found, propose:
- What to consolidate
- Where the canonical version should live
- How other files should reference it

### 4. Output Format
Return a JSON object with this structure:
```json
{{
  "redundancies": [
    {{
      "type": "duplicate_section|agent_overlap|stale_content",
      "description": "What is redundant",
      "locations": ["file1.md", "file2.md"],
      "recommendation": "What to do"
    }}
  ],
  "agent_merges": [
    {{
      "agents_to_merge": ["agent1", "agent2"],
      "new_agent_name": "merged-agent",
      "rationale": "Why merge these"
    }}
  ],
  "proposed_changes": [
    {{
      "file": "path/to/file.md",
      "action": "update|delete|create",
      "description": "What changes to make"
    }}
  ]
}}
```

Analyze the configuration and return ONLY the JSON object:"""


def build_full_prompt(current_claude_md, patterns_content, agents_content, shared_content):
    """Build comprehensive prompt for full analysis mode"""
    return f"""You are an expert software engineering assistant specializing in Claude Code configuration management and optimization.

Your task is to:
1. Analyze patterns and learnings from development sessions
2. Detect and eliminate redundancy across configuration files
3. Propose agent consolidations where appropriate
4. Generate an optimized CLAUDE.md

## Current CLAUDE.md:
```markdown
{current_claude_md}
```

## Patterns and Learnings from LLM Scratchpad:
{chr(10).join(patterns_content) if patterns_content else "No patterns available"}

## Agent Files:
{chr(10).join(agents_content)}

## Shared Files:
{chr(10).join(shared_content)}

## Analysis Instructions:

### Phase 1: Redundancy Analysis
1. **Duplicate Sections**: Every agent has identical:
   - "CRITICAL: Autonomous Operation" section (~25 lines)
   - "Completion Assessment Handoff" section (~45 lines)
   These should be extracted to shared/ and referenced.

2. **Rule Duplication**: The 17 critical rules appear in both CLAUDE.md and critical-rules.md

3. **Agent Overlap**: security-auditor and infra-security-engineer have significant overlap in:
   - Cloud security (AWS, Azure, GCP)
   - Compliance (PCI DSS, SOC 2, HIPAA)
   - Vulnerability assessment
   Consider merging into unified "security-engineer" agent.

### Phase 2: Pattern Integration
If patterns are available, integrate learnings:
- New agent selection rules
- Updated critical rules from recurring issues
- Enhanced auto-run triggers

### Phase 3: Generate Updated CLAUDE.md
- Remove redundant content
- Add references to shared sections where appropriate
- Update agent table to reflect any consolidations
- Keep it essential and minimal

## Output Requirements:
Return ONLY the updated CLAUDE.md content (no JSON, no explanations).
If proposing agent merges, note them in a comment at the top.

Generate the optimized CLAUDE.md:"""


def main():
    parser = argparse.ArgumentParser(description='Consolidate patterns and cleanup config using Claude API')
    parser.add_argument('--scratchpad-dir', required=True, help='Path to llm-scratchpad directory')
    parser.add_argument('--claude-md', required=True, help='Path to current CLAUDE.md')
    parser.add_argument('--agents-dir', default='claude/agents', help='Path to agents directory')
    parser.add_argument('--shared-dir', default='claude/shared', help='Path to shared directory')
    parser.add_argument('--output', required=True, help='Output path for updated CLAUDE.md')
    parser.add_argument('--mode', choices=['full', 'patterns-only', 'cleanup-only'],
                        default='full', help='Analysis mode')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')

    args = parser.parse_args()

    # Get API key from environment
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key and not args.dry_run:
        print("Error: ANTHROPIC_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    # Read current CLAUDE.md
    current_claude_md = read_file_safe(args.claude_md)
    if not current_claude_md:
        print(f"Error: Could not read {args.claude_md}", file=sys.stderr)
        sys.exit(1)

    # Find and read pattern files (for patterns-only and full modes)
    patterns_content = []
    if args.mode in ['patterns-only', 'full']:
        pattern_files = find_pattern_files(args.scratchpad_dir)
        for pattern_file in pattern_files:
            content = read_file_safe(pattern_file)
            if content:
                patterns_content.append(f"## {pattern_file.relative_to(Path(args.scratchpad_dir))}\n\n{content}")

    # Find and read agent files (for cleanup-only and full modes)
    agents_content = []
    if args.mode in ['cleanup-only', 'full']:
        agent_files = find_agent_files(args.agents_dir)
        for agent_file in agent_files:
            content = read_file_safe(agent_file)
            if content:
                agents_content.append(f"## {agent_file.name}\n\n{content}")

    # Find and read shared files
    shared_content = []
    if args.mode in ['cleanup-only', 'full']:
        shared_files = find_shared_files(args.shared_dir)
        for shared_file in shared_files:
            content = read_file_safe(shared_file)
            if content:
                shared_content.append(f"## {shared_file.name}\n\n{content}")

    # Dry run reporting
    if args.dry_run:
        print(f"DRY RUN: Mode = {args.mode}")
        print(f"Found {len(patterns_content)} pattern files")
        print(f"Found {len(agents_content)} agent files")
        print(f"Found {len(shared_content)} shared files")

        if args.mode == 'cleanup-only':
            print("\nRedundancy detection would analyze:")
            print("  - Duplicate sections across agents (autonomous operation, completion handoff)")
            print("  - Agent overlap (security-auditor vs infra-security-engineer)")
            print("  - Rule duplication (CLAUDE.md vs critical-rules.md)")
        elif args.mode == 'patterns-only':
            print("\nPattern analysis would look for:")
            print("  - Common mistakes to avoid")
            print("  - Successful patterns to reinforce")
            print("  - New agent capabilities")
        else:
            print("\nFull analysis would perform both pattern analysis and cleanup")
        return

    # Build appropriate prompt based on mode
    if args.mode == 'patterns-only':
        if not patterns_content:
            print("No pattern files found in scratchpad", file=sys.stderr)
            sys.exit(0)
        prompt = build_patterns_prompt(current_claude_md, patterns_content)
    elif args.mode == 'cleanup-only':
        prompt = build_cleanup_prompt(current_claude_md, agents_content, shared_content)
    else:  # full mode
        prompt = build_full_prompt(current_claude_md, patterns_content, agents_content, shared_content)

    # Call Claude API
    print(f"Analyzing configuration (mode: {args.mode}) with Claude API...")
    updated_content = call_claude_api(prompt, api_key)

    # For cleanup-only mode, the response is JSON - handle differently
    if args.mode == 'cleanup-only':
        print("Cleanup analysis complete. Results:")
        print(updated_content)
        # Write the analysis to a report file
        report_path = args.output.replace('.proposed', '.cleanup-report.json')
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        print(f"Cleanup report written to {report_path}")
        return

    # Check if there are meaningful changes
    if updated_content.strip() == current_claude_md.strip():
        print("No changes needed - configuration is already optimized")
        sys.exit(0)

    # Write updated content
    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(updated_content)

    print(f"Updated CLAUDE.md written to {args.output}")
    if patterns_content:
        print(f"Analyzed {len(patterns_content)} pattern files")
    if agents_content:
        print(f"Analyzed {len(agents_content)} agent files")


if __name__ == "__main__":
    main()
