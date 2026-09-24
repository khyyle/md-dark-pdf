#!/bin/bash
# Double-click to pick a Markdown file and export a dark PDF.
cd "$(dirname "$0")" || exit 1
exec ./bin/md-dark-pdf.mjs
