# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repository currently contains a single-file web app: `tictactoe.html` — a browser-based two-player Tic Tac Toe game with score tracking.

## Running the app

Open the HTML file directly in a browser:

```bash
open tictactoe.html
```

No build step, bundler, or server is required.

## Git workflow

After every meaningful change, commit with a clear descriptive message and push to GitHub:

```bash
git add <files>
git commit -m "short description of what changed and why"
git push
```

Commit at logical milestones — don't batch unrelated changes into one commit. This ensures we always have a recoverable version on GitHub.

## Architecture

Everything lives in one self-contained file (`tictactoe.html`): HTML structure, CSS styles, and vanilla JavaScript — no frameworks or dependencies.
