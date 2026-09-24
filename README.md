# md-dark-pdf

Export Markdown to a dark VS Code / modern editor-styled PDF, with diagrams rendered by [`beautiful-mermaid`](https://www.npmjs.com/package/beautiful-mermaid) without clipping.

Designed for developer notes, architecture specs, and documentation.

---

## Requirements

- **Node.js 18+**
- **[Pandoc](https://pandoc.org/)**
  - macOS: `brew install pandoc`
  - Linux: `sudo apt install pandoc` / `sudo dnf install pandoc`
  - Windows: `winget install JohnMacFarlane.Pandoc`
- **Google Chrome** (or Chromium, Microsoft Edge, Brave)
- *(Optional)* **ffmpeg** for slicing tall diagrams across multi-page PDFs:
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg`
- *(Optional on Linux)* **zenity** or **kdialog** if you want a file picker prompt when running without arguments.

---

## Install

Clone the repository and install globally:

```bash
git clone https://github.com/khyyle/md-dark-pdf.git
cd md-dark-pdf
npm install -g .    # place md-dark-pdf binary on system PATH
```

> If you plan to modify the source code locally, you use `npm install && npm link` instead so code edits apply immediately without reinstalling

---

## Usage

### Command Line

```bash
# Open a file picker to select a .md file
md-dark-pdf

# Export notes.md -> notes.pdf (saved in the same directory)
md-dark-pdf notes.md

# Specify custom output path
md-dark-pdf notes.md -o ~/Desktop/summary.pdf

# Export without automatically opening the PDF
md-dark-pdf notes.md --no-open
```


> On macOS, you can also double-click `md-dark-pdf.command` in Finder to launch a file picker without opening the terminal.

---

## Features

- **VS Code Dark+ Styling**: Styled with a clean dark palette (`#1e1e1e` background, `#cccccc` body, light gray headers, syntax-tinted code blocks, and styled tables).
- **Edge-to-Edge Dark Printing**: No white border or paper margins around the dark theme.
- **`beautiful-mermaid` Diagrams**: Renders ` ```mermaid ` code blocks into dark SVG/PNG diagrams.
- **Smart Multi-Page Slicing**: When `ffmpeg` is installed, oversized diagrams are automatically sliced into page-height sections so nothing gets clipped across page breaks.
- **Cross-Platform**: Works on macOS, Linux, and Windows.
