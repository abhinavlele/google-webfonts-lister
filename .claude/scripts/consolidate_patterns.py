#!/usr/bin/env python3
"""
Consolidate patterns from llm-scratchpad into CLAUDE.md configuration.

This script reads patterns, observations, and improvements from the llm-scratchpad
repository and proposes updates to the CLAUDE.md configuration file.
"""

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class Pattern:
    """Represents a pattern or anti-pattern."""
    title: str
    description: str
    correct_approach: Optional[str] = None
    wrong_approach: Optional[str] = None
    first_observed: Optional[str] = None
    frequency: Optional[str] = None
    code_example: Optional[str] = None
    is_anti_pattern: bool = False


@dataclass
class Improvement:
    """Represents a suggested improvement."""
    title: str
    description: str
    priority: str = "medium"
    applied: bool = False


@dataclass
class UserCorrection:
    """Represents a user correction from observations."""
    correction: str
    context: Optional[str] = None


@dataclass
class ConsolidatedData:
    """Holds all consolidated data from scratchpad."""
    anti_patterns: list[Pattern] = field(default_factory=list)
    good_patterns: list[Pattern] = field(default_factory=list)
    user_corrections: list[UserCorrection] = field(default_factory=list)
    pending_improvements: list[Improvement] = field(default_factory=list)
    applied_improvements: list[Improvement] = field(default_factory=list)


class MarkdownParser:
    """Parse markdown files from llm-scratchpad."""

    def __init__(self, scratchpad_dir: Path):
        self.scratchpad_dir = scratchpad_dir

    def find_repo_dirs(self) -> list[Path]:
        """Find all repository directories with pattern files."""
        repo_dirs = []
        for path in self.scratchpad_dir.iterdir():
            if path.is_dir() and not path.name.startswith('.'):
                if (path / 'patterns.md').exists() or \
                   (path / 'observations.md').exists() or \
                   (path / 'improvements.md').exists():
                    repo_dirs.append(path)
        return repo_dirs

    def parse_patterns(self, content: str) -> tuple[list[Pattern], list[Pattern]]:
        """Parse patterns.md content into anti-patterns and good patterns."""
        anti_patterns = []
        good_patterns = []

        # Split into sections
        sections = re.split(r'^## ', content, flags=re.MULTILINE)

        for section in sections:
            if section.startswith('Anti-Patterns') or section.startswith('Anti-patterns'):
                anti_patterns.extend(self._parse_pattern_section(section, is_anti=True))
            elif section.startswith('Good Patterns') or section.startswith('Good patterns'):
                good_patterns.extend(self._parse_pattern_section(section, is_anti=False))

        return anti_patterns, good_patterns

    def _parse_pattern_section(self, section: str, is_anti: bool) -> list[Pattern]:
        """Parse a pattern section into individual patterns."""
        patterns = []
        # Split by ### headers
        pattern_blocks = re.split(r'^### ', section, flags=re.MULTILINE)

        for block in pattern_blocks[1:]:  # Skip the section header
            lines = block.strip().split('\n')
            if not lines:
                continue

            # First line is the title (may have number prefix)
            title_line = lines[0].strip()
            title = re.sub(r'^\d+\.\s*', '', title_line)

            description_parts = []
            correct = None
            wrong = None
            first_observed = None
            frequency = None
            code_example = None
            in_code_block = False
            code_lines = []

            for line in lines[1:]:
                if line.startswith('```'):
                    if in_code_block:
                        code_example = '\n'.join(code_lines)
                        code_lines = []
                    in_code_block = not in_code_block
                    continue

                if in_code_block:
                    code_lines.append(line)
                    continue

                if line.startswith('- **First observed**:'):
                    first_observed = line.split(':', 1)[1].strip()
                elif line.startswith('- **Frequency**:'):
                    frequency = line.split(':', 1)[1].strip()
                elif line.startswith('- **Correct approach**:'):
                    correct = line.split(':', 1)[1].strip()
                elif line.startswith('- **Wrong approach**:'):
                    wrong = line.split(':', 1)[1].strip()
                elif line.startswith('- **Reason**:'):
                    description_parts.append(line.split(':', 1)[1].strip())
                elif line.strip() and not line.startswith('-'):
                    description_parts.append(line.strip())

            patterns.append(Pattern(
                title=title,
                description=' '.join(description_parts) if description_parts else title,
                correct_approach=correct,
                wrong_approach=wrong,
                first_observed=first_observed,
                frequency=frequency,
                code_example=code_example,
                is_anti_pattern=is_anti
            ))

        return patterns

    def parse_observations(self, content: str) -> list[UserCorrection]:
        """Parse observations.md to extract user corrections."""
        corrections = []

        # Find User Corrections section
        match = re.search(r'### User Corrections\s*\n(.*?)(?=\n###|\Z)',
                          content, re.DOTALL)
        if match:
            correction_text = match.group(1)
            for line in correction_text.split('\n'):
                line = line.strip()
                if line.startswith('-'):
                    # Remove markdown quotes if present
                    correction = re.sub(r'^-\s*["\']?|["\']?$', '', line).strip()
                    if correction:
                        corrections.append(UserCorrection(correction=correction))

        return corrections

    def parse_improvements(self, content: str) -> tuple[list[Improvement], list[Improvement]]:
        """Parse improvements.md into applied and pending improvements."""
        applied = []
        pending = []

        sections = re.split(r'^## ', content, flags=re.MULTILINE)

        current_priority = "medium"
        for section in sections:
            if section.startswith('Applied'):
                applied.extend(self._parse_improvement_items(section, applied=True))
            elif section.startswith('Pending'):
                # Check for priority subsections
                priority_sections = re.split(r'^### ', section, flags=re.MULTILINE)
                for psec in priority_sections:
                    if psec.lower().startswith('high'):
                        current_priority = "high"
                    elif psec.lower().startswith('medium'):
                        current_priority = "medium"
                    elif psec.lower().startswith('low'):
                        current_priority = "low"

                    items = self._parse_improvement_items(psec, applied=False)
                    for item in items:
                        item.priority = current_priority
                    pending.extend(items)

        return applied, pending

    def _parse_improvement_items(self, section: str, applied: bool) -> list[Improvement]:
        """Parse numbered improvement items from a section."""
        improvements = []
        # Match numbered items like "1. **Title**: Description"
        pattern = r'^\d+\.\s*\*\*([^*]+)\*\*[:\s]*(.*?)(?=^\d+\.|\Z)'
        matches = re.findall(pattern, section, re.MULTILINE | re.DOTALL)

        for title, desc in matches:
            desc_clean = ' '.join(desc.strip().split())
            improvements.append(Improvement(
                title=title.strip(),
                description=desc_clean,
                applied=applied
            ))

        return improvements

    def consolidate(self) -> ConsolidatedData:
        """Consolidate all data from scratchpad repositories."""
        data = ConsolidatedData()

        for repo_dir in self.find_repo_dirs():
            patterns_file = repo_dir / 'patterns.md'
            observations_file = repo_dir / 'observations.md'
            improvements_file = repo_dir / 'improvements.md'

            if patterns_file.exists():
                content = patterns_file.read_text()
                anti, good = self.parse_patterns(content)
                data.anti_patterns.extend(anti)
                data.good_patterns.extend(good)

            if observations_file.exists():
                content = observations_file.read_text()
                corrections = self.parse_observations(content)
                data.user_corrections.extend(corrections)

            if improvements_file.exists():
                content = improvements_file.read_text()
                applied, pending = self.parse_improvements(content)
                data.applied_improvements.extend(applied)
                data.pending_improvements.extend(pending)

        return data


class ConfigUpdater:
    """Update CLAUDE.md configuration based on consolidated patterns."""

    def __init__(self, claude_md_path: Path):
        self.claude_md_path = claude_md_path
        self.original_content = claude_md_path.read_text() if claude_md_path.exists() else ""

    def generate_updates(self, data: ConsolidatedData) -> str:
        """Generate updated CLAUDE.md content."""
        content = self.original_content

        # Check if we need to add a "Learned Patterns" section
        patterns_section = self._generate_patterns_section(data)
        if patterns_section:
            content = self._insert_or_update_section(
                content,
                "Learned Patterns",
                patterns_section
            )

        return content

    def _generate_patterns_section(self, data: ConsolidatedData) -> str:
        """Generate a Learned Patterns section from consolidated data."""
        lines = []

        # Filter out patterns that might already be in CLAUDE.md
        new_anti_patterns = [p for p in data.anti_patterns
                            if not self._pattern_exists(p)]
        new_good_patterns = [p for p in data.good_patterns
                            if not self._pattern_exists(p)]

        if not new_anti_patterns and not new_good_patterns:
            return ""

        if new_anti_patterns:
            lines.append("### Anti-Patterns (AVOID)")
            lines.append("")
            for i, pattern in enumerate(new_anti_patterns, 1):
                lines.append(f"**{i}. {pattern.title}**")
                if pattern.wrong_approach:
                    lines.append(f"- Wrong: {pattern.wrong_approach}")
                if pattern.correct_approach:
                    lines.append(f"- Correct: {pattern.correct_approach}")
                if pattern.code_example:
                    lines.append("```")
                    lines.append(pattern.code_example)
                    lines.append("```")
                lines.append("")

        if new_good_patterns:
            lines.append("### Good Patterns (REPLICATE)")
            lines.append("")
            for i, pattern in enumerate(new_good_patterns, 1):
                lines.append(f"**{i}. {pattern.title}**")
                if pattern.description and pattern.description != pattern.title:
                    lines.append(f"- {pattern.description}")
                if pattern.code_example:
                    lines.append("```ruby")
                    lines.append(pattern.code_example)
                    lines.append("```")
                lines.append("")

        return '\n'.join(lines)

    def _pattern_exists(self, pattern: Pattern) -> bool:
        """Check if a pattern is already mentioned in CLAUDE.md."""
        # Simple check: see if the title or key terms exist
        title_lower = pattern.title.lower()
        content_lower = self.original_content.lower()

        # Check for exact title match
        if title_lower in content_lower:
            return True

        # Check for key terms from correct/wrong approaches
        if pattern.correct_approach:
            key_term = pattern.correct_approach.split()[0].lower().strip('`')
            if key_term in content_lower and len(key_term) > 3:
                return True

        return False

    def _insert_or_update_section(self, content: str, section_name: str,
                                   new_content: str) -> str:
        """Insert or update a section in the markdown content."""
        section_pattern = rf'^## {re.escape(section_name)}\s*\n(.*?)(?=^## |\Z)'
        match = re.search(section_pattern, content, re.MULTILINE | re.DOTALL)

        if match:
            # Update existing section
            start, end = match.span(1)
            return content[:start] + new_content + '\n\n' + content[end:]
        else:
            # Insert new section before "## User Info" or at end
            user_info_match = re.search(r'^## User Info', content, re.MULTILINE)
            if user_info_match:
                insert_pos = user_info_match.start()
                return (content[:insert_pos] +
                        f"## {section_name}\n\n{new_content}\n\n" +
                        content[insert_pos:])
            else:
                return content + f"\n\n## {section_name}\n\n{new_content}"

    def has_changes(self, new_content: str) -> bool:
        """Check if the new content differs from original."""
        return new_content.strip() != self.original_content.strip()


def main():
    parser = argparse.ArgumentParser(
        description='Consolidate patterns from llm-scratchpad into CLAUDE.md'
    )
    parser.add_argument('--scratchpad-dir', required=True,
                        help='Path to llm-scratchpad repository')
    parser.add_argument('--claude-md', required=True,
                        help='Path to CLAUDE.md file')
    parser.add_argument('--output', required=True,
                        help='Path for output file')
    parser.add_argument('--dry-run', action='store_true',
                        help='Print changes without writing')

    args = parser.parse_args()

    scratchpad_dir = Path(args.scratchpad_dir)
    claude_md_path = Path(args.claude_md)
    output_path = Path(args.output)

    if not scratchpad_dir.exists():
        print(f"Error: Scratchpad directory not found: {scratchpad_dir}")
        sys.exit(1)

    # Parse and consolidate patterns
    md_parser = MarkdownParser(scratchpad_dir)
    consolidated_data = md_parser.consolidate()

    print(f"Found {len(consolidated_data.anti_patterns)} anti-patterns")
    print(f"Found {len(consolidated_data.good_patterns)} good patterns")
    print(f"Found {len(consolidated_data.user_corrections)} user corrections")
    print(f"Found {len(consolidated_data.pending_improvements)} pending improvements")

    # Generate updates
    updater = ConfigUpdater(claude_md_path)
    new_content = updater.generate_updates(consolidated_data)

    if updater.has_changes(new_content):
        if args.dry_run:
            print("\n=== Proposed Changes ===")
            print(new_content)
        else:
            output_path.write_text(new_content)
            print(f"\nChanges written to: {output_path}")

            # Also update the original file
            claude_md_path.write_text(new_content)
            print(f"Updated: {claude_md_path}")
    else:
        print("\nNo new patterns to add - CLAUDE.md is up to date")
        sys.exit(0)


if __name__ == '__main__':
    main()
