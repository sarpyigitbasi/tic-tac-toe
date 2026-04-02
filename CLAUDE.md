# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is a multi-project repository containing web apps and experiments built with vanilla HTML/CSS/JS. No build step, bundler, or server is required for any file — open directly in a browser.

**Current projects:**
- `tictactoe.html` — two-player Tic Tac Toe game with score tracking
- `index.html` — AXIOM fictional AI company landing page (futuristic design showcase)

## Running any project

```bash
open tictactoe.html
open index.html
```

## Git workflow

After every meaningful change, commit with a clear descriptive message and push to GitHub:

```bash
git add <files>
git commit -m "short description of what changed and why"
git push
```

Commit at logical milestones — don't batch unrelated changes into one commit. This ensures we always have a recoverable version on GitHub at [sarpyigitbasi/claude_code](https://github.com/sarpyigitbasi/claude_code).

## Subagents

Specialized agents are defined in `.claude/agents/`:

- **code-reviewer** — audits files for bugs, logic errors, and edge cases, then fixes them directly
- **ui-ux-designer** — improves and builds UI/UX: layout, animations, accessibility, responsiveness

Invoke them by name, e.g. *"Ask the code-reviewer to review index.html"*.

## UI/UX skill

The **ui-ux-pro-max** skill is installed at `.claude/skills/ui-ux-pro-max/`. It activates automatically for UI/UX requests and provides:
- 67 UI styles (glassmorphism, claymorphism, brutalism, etc.)
- 161 industry-specific design system rules
- 57 font pairings, 161 color palettes
- Stack-specific guidelines including SwiftUI and React Native

## Architecture

All projects are single self-contained HTML files (HTML + CSS + vanilla JS). No frameworks or external dependencies beyond Google Fonts.
