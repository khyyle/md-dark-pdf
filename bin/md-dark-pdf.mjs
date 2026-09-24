#!/usr/bin/env node
/**
 * md-dark-pdf — Markdown -> dark Cursor-themed PDF with beautiful-mermaid.
 *
 * Usage:
 *   md-dark-pdf                         # Finder file picker
 *   md-dark-pdf notes.md
 *   md-dark-pdf notes.md -o out.pdf
 *   md-dark-pdf notes.md --no-open
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderMermaidSVG } from "beautiful-mermaid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CSS_PATH = join(ROOT, "assets", "dark.css");

const VSCODE_DARK = {
  bg: "#1e1e1e",
  fg: "#cccccc",
  accent: "#4fc1ff",
  line: "#4fc1ff",
  muted: "#9d9d9d",
  surface: "#252526",
  border: "#6e6e6e",
  transparent: false,
  font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
};

const MERMAID_FENCE = /```mermaid\n([\s\S]*?)```/g;

function usage() {
  console.log(`Usage: md-dark-pdf [markdown.md] [-o output.pdf] [--no-open]

Exports Markdown to a VS Code Dark+ themed PDF using beautiful-mermaid.

Options:
  -o, --output <file.pdf>   Output file path (default: next to input file)
  --no-open                 Do not automatically open the PDF
  -h, --help                Show this help message

Running without arguments opens a file picker.
`);
}

function parseArgs(argv) {
  const args = { input: null, output: null, open: true };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      usage();
      process.exit(0);
    }
    if (a === "--no-open") {
      args.open = false;
      continue;
    }
    if (a === "-o" || a === "--output") {
      args.output = argv[++i];
      continue;
    }
    if (a.startsWith("-")) {
      fail(`Unknown flag: ${a}`);
    }
    positional.push(a);
  }
  if (positional.length > 1) fail("Pass at most one Markdown file.");
  args.input = positional[0] ?? null;
  return args;
}

function fail(message) {
  console.error(`md-dark-pdf: ${message}`);
  process.exit(1);
}

function which(command) {
  if (!command) return null;
  const tool = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(tool, [command], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null;
}

function findChrome() {
  const envChrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envChrome && existsSync(envChrome)) return envChrome;

  const platform = process.platform;
  const candidates = [];

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    );
  } else if (platform === "win32") {
    const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA || "";
    candidates.push(
      join(programFiles, "Google\\Chrome\\Application\\chrome.exe"),
      join(programFilesX86, "Google\\Chrome\\Application\\chrome.exe"),
      join(localAppData, "Google\\Chrome\\Application\\chrome.exe"),
      join(programFiles, "Microsoft\\Edge\\Application\\msedge.exe"),
      join(programFilesX86, "Microsoft\\Edge\\Application\\msedge.exe"),
    );
  } else {
    candidates.push(
      which("google-chrome"),
      which("google-chrome-stable"),
      which("chromium"),
      which("chromium-browser"),
      which("microsoft-edge"),
      which("brave-browser"),
    );
  }

  candidates.push(which("google-chrome"), which("chromium"), which("chrome"), which("msedge"));

  for (const path of candidates) {
    if (path && existsSync(path)) return path;
  }
  return null;
}

function chooseFileMac() {
  const script = `
try
  set chosen to choose file with prompt "Choose a Markdown file to export" of type {"net.daringfireball.markdown", "public.plain-text", "public.utf8-plain-text", "md", "markdown", "txt"}
  return POSIX path of chosen
on error number -128
  return ""
end try
`;
  const result = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
  if (result.status !== 0) fail("Finder file picker failed.");
  const path = result.stdout.trim();
  if (!path) {
    console.error("Cancelled.");
    process.exit(0);
  }
  return path;
}

function chooseFileWindows() {
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "Choose a Markdown file to export"
$dialog.Filter = "Markdown Files (*.md;*.markdown;*.txt)|*.md;*.markdown;*.txt|All Files (*.*)|*.*"
$dialog.RestoreDirectory = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.FileName
}
`;
  const result = spawnSync("powershell", ["-NoProfile", "-STA", "-Command", psScript], {
    encoding: "utf8",
  });
  if (result.status !== 0) return { error: true };
  const path = result.stdout.trim();
  if (!path) {
    console.error("Cancelled.");
    process.exit(0);
  }
  return { path };
}

function chooseFileLinux() {
  const zenity = which("zenity");
  if (zenity) {
    const result = spawnSync(zenity, [
      "--file-selection",
      "--title=Choose a Markdown file to export",
      "--file-filter=Markdown files (*.md, *.markdown, *.txt) | *.md *.markdown *.txt",
      "--file-filter=All files | *",
    ], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) {
      return { path: result.stdout.trim() };
    }
    console.error("Cancelled.");
    process.exit(0);
  }

  const kdialog = which("kdialog");
  if (kdialog) {
    const result = spawnSync(kdialog, [
      "--getopenfilename",
      ".",
      "*.md *.markdown *.txt|Markdown files",
      "--title",
      "Choose a Markdown file to export",
    ], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) {
      return { path: result.stdout.trim() };
    }
    console.error("Cancelled.");
    process.exit(0);
  }

  return { unsupported: true };
}

function chooseInputFile() {
  if (process.platform === "darwin") {
    return chooseFileMac();
  }
  if (process.platform === "win32") {
    const res = chooseFileWindows();
    if (res?.path) return res.path;
  }
  if (process.platform === "linux") {
    const res = chooseFileLinux();
    if (res?.path) return res.path;
  }

  fail(
    "No input file specified. Usage: md-dark-pdf <file.md> [-o output.pdf]" +
      (process.platform === "linux"
        ? "\nTip: Install 'zenity' or 'kdialog' for a file picker on Linux."
        : ""),
  );
}

function openPdf(filePath) {
  if (process.platform === "darwin") {
    spawnSync("open", [filePath], { stdio: "ignore" });
  } else if (process.platform === "win32") {
    spawnSync("cmd", ["/c", "start", '""', filePath], { stdio: "ignore" });
  } else {
    spawnSync("xdg-open", [filePath], { stdio: "ignore" });
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    ...options,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function pngSize(pngPath) {
  const buffer = readFileSync(pngPath);

  // check bytes 1-3 for "PNG"
  if (buffer.toString("ascii", 1, 4) !== "PNG") fail(`Not a PNG: ${pngPath}`);
  return {
    // IHDR width/height are at bytes 16..23 for standard PNGs
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function renderMermaidToPngSlices(mermaidSource, workDir, chrome, index) {
  let svg = renderMermaidSVG(mermaidSource, CURSOR_DARK);
  
  // avoid Google Fonts fetch
  svg = svg.replace( 
    /@import url\('https:\/\/fonts\.googleapis\.com\/[^']+'\);/g,
    "",
  );

  const svgPath = join(workDir, `diagram-${index}.svg`);
  const htmlPath = join(workDir, `diagram-${index}.html`);
  const pngPath = join(workDir, `diagram-${index}.png`);
  writeFileSync(svgPath, svg);

  const viewBox = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  const width = viewBox ? Math.ceil(Number(viewBox[1])) + 2 : 1200;
  const height = viewBox ? Math.ceil(Number(viewBox[2])) + 2 : 800;

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #1e1e1e; }
  body { display: flex; justify-content: center; }
  svg { display: block; }
</style></head>
<body>${svg}</body></html>`;
  writeFileSync(htmlPath, html);

  run(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--force-device-scale-factor=2",
    `--window-size=${width},${height}`,
    `--screenshot=${pngPath}`,
    "--default-background-color=1e1e1e",
    "--virtual-time-budget=4000",
    pathToFileURL(htmlPath).href,
  ]);

  if (!existsSync(pngPath)) fail("Chrome did not write diagram PNG.");

  // Chrome print cannot break tall images across pages, so slice them.
  const { width: pngWidth, height: pngHeight } = pngSize(pngPath);
  const pixelsPerInch = pngWidth / 7.5;
  const firstSliceHeight = Math.min(Math.floor(8.5 * pixelsPerInch), pngHeight);
  const nextSliceHeight = Math.floor(9.8 * pixelsPerInch);

  const ffmpeg = which("ffmpeg");
  if (!ffmpeg) {
    console.error(
      "  warning: ffmpeg not found, tall diagrams may leave a blank first page",
    );
    return [pngPath];
  }
  
  const slices = [];
  let y = 0;
  let sliceIndex = 0;
  while (y < pngHeight) {
    const chunk =
      sliceIndex === 0
        ? firstSliceHeight
        : Math.min(nextSliceHeight, pngHeight - y);
    
    const slicePath = join(workDir, `diagram-${index}-slice-${sliceIndex}.png`);
    
    run(ffmpeg, [
      "-y",
      "-i",
      pngPath,
      "-vf",
      `crop=${pngWidth}:${chunk}:0:${y}`,
      slicePath,
    ]);
    slices.push(slicePath);
    y += chunk;
    sliceIndex += 1;
  }
  return slices;
}

function imageHtmlFromPngs(pngPaths) {
  return pngPaths
    .map((pngPath, i) => {
      const b64 = readFileSync(pngPath).toString("base64");
      const margin = i === 0 ? "0.35rem 0 0" : "0";
      return `<div style="margin:${margin};"><img src="data:image/png;base64,${b64}" alt="Diagram" style="width:100%;height:auto;display:block;"/></div>`;
    })
    .join("\n");
}

function replaceMermaidBlocks(markdown, workDir, chrome) {
  let index = 0;
  return markdown.replace(MERMAID_FENCE, (_match, source) => {
    const slices = renderMermaidToPngSlices(source.trim() + "\n", workDir, chrome, index);
    index += 1;
    console.error(`  rendered mermaid diagram ${index} (${slices.length} page slice${slices.length === 1 ? "" : "s"})`);
    return imageHtmlFromPngs(slices);
  });
}

function buildHtml(markdownPath, preparedMarkdown, workDir) {
  const preparedPath = join(workDir, "prepared.md");
  const htmlPath = join(workDir, "document.html");
  writeFileSync(preparedPath, preparedMarkdown);

  const pandoc = which("pandoc");
  if (!pandoc) fail("pandoc not found. Install with: brew install pandoc");

  run(pandoc, [
    preparedPath,
    "-f",
    "markdown+raw_html+gfm_auto_identifiers",
    "-t",
    "html5",
    "--standalone",
    `--css=${pathToFileURL(CSS_PATH).href}`,
    "-o",
    htmlPath,
    "-V",
    "title=",
  ]);

  let html = readFileSync(htmlPath, "utf8");
  html = html.replace(/<header[\s\S]*?<\/header>/, "");
  html = html.replace(/<h1[^>]*class="title"[^>]*>[\s\S]*?<\/h1>\s*/i, "");
  writeFileSync(htmlPath, html);
  return htmlPath;
}

function printPdf(chrome, htmlPath, outputPath) {
  run(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--virtual-time-budget=3000",
    `--print-to-pdf=${outputPath}`,
    pathToFileURL(htmlPath).href,
  ]);
  if (!existsSync(outputPath)) fail("Chrome did not write the PDF.");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolve(args.input ?? chooseInputFile());

  if (!existsSync(inputPath)) fail(`File not found: ${inputPath}`);
  if (!existsSync(CSS_PATH)) fail(`Missing stylesheet: ${CSS_PATH}`);

  const chrome = findChrome();
  if (!chrome) fail("Google Chrome (or Chromium/Edge) is required for PDF export.");

  const ext = extname(inputPath).toLowerCase();
  if (![".md", ".markdown", ".txt", ""].includes(ext)) {
    console.error(`Warning: ${basename(inputPath)} does not look like Markdown.`);
  }

  const outputPath = resolve(
    args.output ??
      join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.pdf`),
  );

  const workDir = mkdtempSync(join(tmpdir(), "md-dark-pdf-"));
  try {
    console.error(`Exporting ${inputPath}`);
    const markdown = readFileSync(inputPath, "utf8");
    const prepared = replaceMermaidBlocks(markdown, workDir, chrome);
    const htmlPath = buildHtml(inputPath, prepared, workDir);
    printPdf(chrome, htmlPath, outputPath);
    console.error(`Wrote ${outputPath}`);

    if (args.open) {
      openPdf(outputPath);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
