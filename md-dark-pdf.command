#!/bin/bash
# macOS only: double-click in Finder to pick a Markdown file and export a dark PDF.

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-}"

if ! command -v md-dark-pdf >/dev/null 2>&1; then
  echo "md-dark-pdf is not installed."
  echo "From the repo root, run: npm install -g ."
  exit 1
fi

exec md-dark-pdf
