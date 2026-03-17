import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

interface CardData {
  displayName: string;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  streak: number;
  date: string;
  branch: string | null;
  readinessScore?: number | null;
  shareableUpdate?: string | null;
  topFiles?: string[] | null;
  shipDecision?: "ship" | "split" | "stabilize" | null;
  sessionMode?: string | null;
  durationMins?: number | null;
  avatarDataUri?: string | null;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return n.toString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function clampText(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 2) + "\u2026" : str;
}

function fileBaseName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

function wrapTextLines(
  input: string,
  maxCharsPerLine: number,
  maxLines: number
): string[] {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(clampText(word, maxCharsPerLine));
      current = "";
    }
  }

  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const clipped = lines.slice(0, maxLines);
  const last = clipped[maxLines - 1];
  const safeLen = Math.max(1, maxCharsPerLine - 1);
  const trimmed = last.length > safeLen ? clampText(last, safeLen) : last;
  clipped[maxLines - 1] = trimmed.endsWith("\u2026")
    ? trimmed
    : `${trimmed}\u2026`;
  return clipped;
}

let _iconDataUri: string | null = null;

function getIconDataUri(): string {
  if (_iconDataUri !== null) return _iconDataUri;
  try {
    const logoPath = path.join(__dirname, "../../public/logo.svg");
    const buf = fs.readFileSync(logoPath);
    _iconDataUri = `data:image/svg+xml;base64,${buf.toString("base64")}`;
  } catch {
    _iconDataUri = "";
  }
  return _iconDataUri;
}

function buildCardSvg(data: CardData): string {
  const W = 840;
  // H will be computed after layout

  const MONO = "'JetBrains Mono','Fira Code','SF Mono','Menlo',monospace";

  // Terminal palette
  const BG = "#0d1117";
  const BG_TITLE = "#161b22";
  const BORDER = "#30363d";
  const GREEN = "#3fb950";
  const RED = "#f85149";
  const BLUE = "#58a6ff";
  const AMBER = "#d29922";
  const CYAN = "#39d353";
  const PURPLE = "#bc8cff";
  const WHITE = "#f0f6fc";
  const MUTED = "#8b949e";
  const DIM = "#484f58";
  const FAINT = "#21262d";

  const safeName = clampText(data.displayName || "dev", 16);
  const branchRaw = data.branch?.trim() || "main";
  const branchStr = clampText(branchRaw, 24);
  const dateStr = formatDate(data.date);

  const addStr = `+${formatNumber(data.linesAdded)}`;
  const remStr = `-${formatNumber(data.linesRemoved)}`;
  const filesStr = formatNumber(data.filesChanged);
  const streakValue = data.durationMins != null && data.durationMins > 0
    ? `${Math.round(data.durationMins)}m`
    : `${formatNumber(data.streak)}d`;
  const streakLabel = data.durationMins != null && data.durationMins > 0
    ? "time" : "streak";

  const readinessScore =
    data.readinessScore != null && Number.isFinite(data.readinessScore)
      ? Math.max(0, Math.min(100, Math.round(data.readinessScore)))
      : null;

  const modeRaw = data.sessionMode
    ? data.sessionMode.replace(/-/g, " ")
    : "";
  // Avoid "session — session" redundancy
  const modeStr = modeRaw === "session" ? "" : modeRaw;

  const descriptionRaw =
    data.shareableUpdate?.trim() ||
    `${addStr} lines added, ${remStr} removed across ${filesStr} files.`;
  const descriptionLines = wrapTextLines(descriptionRaw, 72, 3);

  const shipLabel = data.shipDecision === "ship" ? "SHIP"
    : data.shipDecision === "split" ? "SPLIT"
    : data.shipDecision === "stabilize" ? "HOLD"
    : null;
  const shipColor = data.shipDecision === "ship" ? GREEN
    : data.shipDecision === "split" ? AMBER
    : data.shipDecision === "stabilize" ? RED
    : DIM;

  const readinessColor = readinessScore != null
    ? readinessScore >= 80 ? GREEN
      : readinessScore >= 50 ? AMBER
      : RED
    : DIM;

  // Layout — content-driven height
  const PAD = 20;
  const titleBarH = 38;
  const termX = PAD;
  const termY = PAD;
  const termW = W - PAD * 2;
  const termR = 12;
  const cx = termX + 30;
  const cr = termX + termW - 30;

  // 4-column center positions for metrics (each col = 25% of box width)
  const contentW = cr - cx;
  const colMid1 = cx + contentW * 0.125;
  const colMid2 = cx + contentW * 0.375;
  const colMid3 = cx + contentW * 0.625;
  const colMid4 = cx + contentW * 0.875;

  // Net change bar
  const netTotal = data.linesAdded + data.linesRemoved;
  const barLen = 36;
  const addFilled = Math.round((data.linesAdded / Math.max(netTotal, 1)) * barLen);
  const addBarPart = "\u2588".repeat(addFilled);
  const remBarPart = "\u2588".repeat(barLen - addFilled);

  // Readiness bar
  const readyBarLen = 24;
  const readyFilled = readinessScore != null ? Math.round(readinessScore / 100 * readyBarLen) : 0;
  const readyBarFull = "\u2588".repeat(readyFilled);
  const readyBarEmpty = "\u2591".repeat(readyBarLen - readyFilled);

  // Top files
  const topFiles = data.topFiles
    ? data.topFiles.slice(0, 5).map((f) => fileBaseName(f))
    : [];

  // Confidence text
  const confText = readinessScore != null
    ? readinessScore >= 80 ? "high confidence \u2014 looks shippable"
      : readinessScore >= 50 ? "medium confidence \u2014 needs review"
      : "low confidence \u2014 work in progress"
    : null;

  // Duration text
  const durationText = data.durationMins != null && data.durationMins > 0
    ? data.durationMins >= 60
      ? `${Math.floor(data.durationMins / 60)}h ${data.durationMins % 60}m session`
      : `${data.durationMins}m session`
    : data.streak > 0 ? `${data.streak} day streak` : null;

  // --- Flow-based Y positions — content drives height ---
  const SP = 4; // tight spacing between lines within a group
  const GP = 10; // spacing between groups/sections

  let curY = termY + titleBarH + 22;
  function at(lineH: number): number { const y = curY; curY += lineH; return y; }
  function skip(n: number = GP) { curY += n; }

  const y0 = at(18); skip(GP);                   // $ command
  const yNameDate = at(14); skip(GP);            // centered name + date
  const yBoxTop = curY; skip(16);               // box top edge (padding inside)
  const yLabels = at(12); skip(14);             // metric labels (big gap to values)
  const yValues = at(16); skip(10);             // metric values
  const yNetBar = at(16); skip(10);             // net bar
  const yBoxBot = curY; skip(GP);               // box bottom edge

  const yUpdateLabel = at(16); skip(2);         // ▶ update label
  const yUpdateStart = curY;
  curY += descriptionLines.length * 18;
  skip(GP);                                     // update text

  let yFiles = curY;
  if (topFiles.length > 0) { yFiles = at(18); skip(GP); }

  let yReady = curY;
  if (readinessScore != null) { yReady = at(18); skip(SP); }

  let yConf = curY;
  if (confText) { yConf = at(16); skip(SP); }

  let yDuration = curY;
  if (durationText) { yDuration = at(16); skip(GP); }

  // Separator line, then cursor + "powered by" on same line
  const ySep = at(10); skip(6);
  const yCursor = at(16);

  // Now compute H from content
  const termH = (curY + PAD + 8) - termY;
  const H = termH + PAD * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&amp;display=swap');
  </style>
  <clipPath id="outer"><rect width="${W}" height="${H}" rx="16"/></clipPath>
  <clipPath id="term"><rect x="${termX}" y="${termY}" width="${termW}" height="${termH}" rx="${termR}"/></clipPath>
  <pattern id="scan" width="2" height="4" patternUnits="userSpaceOnUse">
    <rect width="2" height="1" fill="#ffffff" opacity="0.01"/>
  </pattern>
  <radialGradient id="glow" cx="50%" cy="30%" r="60%">
    <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.012"/>
    <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
  </radialGradient>
</defs>

<g clip-path="url(#outer)">
  <rect width="${W}" height="${H}" fill="#010409"/>

  <!-- Terminal window -->
  <rect x="${termX}" y="${termY}" width="${termW}" height="${termH}" rx="${termR}" fill="${BG}" stroke="${BORDER}" stroke-width="1"/>
  <rect x="${termX}" y="${termY}" width="${termW}" height="${titleBarH}" fill="${BG_TITLE}" clip-path="url(#term)"/>
  <line x1="${termX}" y1="${termY + titleBarH}" x2="${termX + termW}" y2="${termY + titleBarH}" stroke="${BORDER}" stroke-width="1"/>

  <!-- Traffic lights -->
  <circle cx="${termX + 22}" cy="${termY + titleBarH / 2}" r="6" fill="${RED}" opacity="0.85"/>
  <circle cx="${termX + 40}" cy="${termY + titleBarH / 2}" r="6" fill="${AMBER}" opacity="0.85"/>
  <circle cx="${termX + 58}" cy="${termY + titleBarH / 2}" r="6" fill="${CYAN}" opacity="0.85"/>

  <!-- Title -->
  <text x="${W / 2}" y="${termY + titleBarH / 2 + 4}" text-anchor="middle" fill="${MUTED}" font-size="12" font-family="${MONO}">${escapeXml(safeName)}@worktrace: ~/${escapeXml(branchStr)}</text>

  <!-- CRT overlay -->
  <rect x="${termX}" y="${termY + titleBarH}" width="${termW}" height="${termH - titleBarH}" fill="url(#scan)" clip-path="url(#term)"/>
  <rect x="${termX}" y="${termY}" width="${termW}" height="${termH}" fill="url(#glow)" clip-path="url(#term)"/>

  <!-- ===== COMMAND ===== -->
  <text x="${cx}" y="${y0}" font-size="13" font-family="${MONO}">
    <tspan fill="${GREEN}">$</tspan>
    <tspan fill="${WHITE}" dx="8">worktrace report</tspan>
    <tspan fill="${MUTED}"> --branch=${escapeXml(branchStr)}</tspan>
  </text>

  <!-- ===== NAME + DATE (centered) ===== -->
  <text x="${(cx + cr) / 2}" y="${yNameDate}" text-anchor="middle" font-size="12" font-family="${MONO}">
    <tspan fill="${CYAN}">${escapeXml(safeName)}</tspan>
    <tspan fill="${DIM}"> \u2014 ${escapeXml(dateStr)}${modeStr ? ` \u2014 ${escapeXml(modeStr)}` : ""}</tspan>
  </text>

  <!-- ===== SESSION BOX (SVG rect) ===== -->
  <rect x="${cx}" y="${yBoxTop}" width="${cr - cx}" height="${yBoxBot - yBoxTop}" rx="4" fill="none" stroke="${DIM}" stroke-width="1"/>

  <!-- Metric labels (centered in each column) -->
  <text x="${colMid1}" y="${yLabels}" text-anchor="middle" font-size="10" font-family="${MONO}" fill="${MUTED}">added</text>
  <text x="${colMid2}" y="${yLabels}" text-anchor="middle" font-size="10" font-family="${MONO}" fill="${MUTED}">removed</text>
  <text x="${colMid3}" y="${yLabels}" text-anchor="middle" font-size="10" font-family="${MONO}" fill="${MUTED}">files</text>
  <text x="${colMid4}" y="${yLabels}" text-anchor="middle" font-size="10" font-family="${MONO}" fill="${MUTED}">${escapeXml(streakLabel)}</text>

  <!-- Metric values (centered under labels) -->
  <text x="${colMid1}" y="${yValues}" text-anchor="middle" font-size="15" font-weight="700" font-family="${MONO}" fill="${GREEN}">${escapeXml(addStr)}</text>
  <text x="${colMid2}" y="${yValues}" text-anchor="middle" font-size="15" font-weight="700" font-family="${MONO}" fill="${RED}">${escapeXml(remStr)}</text>
  <text x="${colMid3}" y="${yValues}" text-anchor="middle" font-size="15" font-weight="700" font-family="${MONO}" fill="${BLUE}">${escapeXml(filesStr)}</text>
  <text x="${colMid4}" y="${yValues}" text-anchor="middle" font-size="15" font-weight="700" font-family="${MONO}" fill="${AMBER}">${escapeXml(streakValue)}</text>

  <!-- Net change bar -->
  <text x="${cx + 14}" y="${yNetBar}" font-size="10" font-family="${MONO}" fill="${MUTED}">net </text>
  <text x="${cx + 46}" y="${yNetBar}" font-size="11" font-family="${MONO}" fill="${GREEN}">${escapeXml(addBarPart)}</text>
  <text x="${cx + 46 + addFilled * 7.2}" y="${yNetBar}" font-size="11" font-family="${MONO}" fill="${RED}">${escapeXml(remBarPart)}</text>
  <text x="${cx + 46 + barLen * 7.2 + 8}" y="${yNetBar}" font-size="10" font-family="${MONO}" fill="${MUTED}">${Math.round((data.linesAdded / Math.max(netTotal, 1)) * 100)}% add</text>

  <!-- ===== UPDATE ===== -->
  <text x="${cx}" y="${yUpdateLabel}" font-size="11" font-family="${MONO}">
    <tspan fill="${PURPLE}">\u25B6</tspan>
    <tspan fill="${MUTED}" dx="6">update</tspan>
  </text>
  ${descriptionLines.map((line, i) =>
    `<text x="${cx + 20}" y="${yUpdateStart + i * 18}" font-size="12.5" font-family="${MONO}" fill="${WHITE}">${escapeXml(line)}</text>`
  ).join("\n  ")}

  <!-- ===== FILES ===== -->
  ${topFiles.length > 0 ? `
  <text x="${cx}" y="${yFiles}" font-size="11" font-family="${MONO}">
    <tspan fill="${PURPLE}">\u25B6</tspan>
    <tspan fill="${MUTED}" dx="6">files</tspan>
    ${topFiles.map((f) =>
      `<tspan fill="${BLUE}" dx="10">${escapeXml(clampText(f, 18))}</tspan>`
    ).join("")}
  </text>
  ` : ""}

  <!-- ===== READINESS ===== -->
  ${readinessScore != null ? `
  <text x="${cx}" y="${yReady}" font-size="11" font-family="${MONO}">
    <tspan fill="${PURPLE}">\u25B6</tspan>
    <tspan fill="${MUTED}" dx="6">ready</tspan>
  </text>
  <text x="${cx + 80}" y="${yReady}" font-size="11" font-family="${MONO}" fill="${readinessColor}">${escapeXml(readyBarFull)}</text>
  <text x="${cx + 80 + readyFilled * 7}" y="${yReady}" font-size="11" font-family="${MONO}" fill="${FAINT}">${escapeXml(readyBarEmpty)}</text>
  <text x="${cx + 80 + readyBarLen * 7 + 10}" y="${yReady}" font-size="16" font-weight="700" font-family="${MONO}" fill="${readinessColor}">${readinessScore}</text>
  <text x="${cx + 80 + readyBarLen * 7 + 10 + String(readinessScore).length * 10 + 2}" y="${yReady}" font-size="11" font-family="${MONO}" fill="${DIM}">/100</text>
  ${shipLabel ? `<text x="${cx + 80 + readyBarLen * 7 + 10 + String(readinessScore).length * 10 + 40}" y="${yReady}" font-size="11" font-weight="700" font-family="${MONO}" fill="${shipColor}">[${escapeXml(shipLabel)}]</text>` : ""}
  ` : ""}

  <!-- ===== CONFIDENCE ===== -->
  ${confText ? `
  <text x="${cx}" y="${yConf}" font-size="11" font-family="${MONO}">
    <tspan fill="${PURPLE}">\u25B6</tspan>
    <tspan fill="${MUTED}" dx="6">status</tspan>
    <tspan fill="${readinessColor}" dx="8">${escapeXml(confText)}</tspan>
  </text>
  ` : ""}

  <!-- ===== DURATION / STREAK ===== -->
  ${durationText ? `
  <text x="${cx}" y="${yDuration}" font-size="11" font-family="${MONO}">
    <tspan fill="${PURPLE}">\u25B6</tspan>
    <tspan fill="${MUTED}" dx="6">uptime</tspan>
    <tspan fill="${AMBER}" dx="8">${escapeXml(durationText)}</tspan>
  </text>
  ` : ""}

  <!-- ===== BOTTOM SEPARATOR (full width line) ===== -->
  <line x1="${cx}" y1="${ySep}" x2="${cr}" y2="${ySep}" stroke="${DIM}" stroke-width="1"/>

  <!-- ===== CURSOR + powered by (same line, typed style, evenly spaced) ===== -->
  <text x="${cx}" y="${yCursor}" font-size="13" font-family="${MONO}" fill="${GREEN}">$</text>
  <text x="${cx + 20}" y="${yCursor}" font-size="13" font-family="${MONO}" fill="${MUTED}">powered by</text>
  <text x="${cx + 106}" y="${yCursor}" font-size="13" font-family="${MONO}" fill="${CYAN}">worktrace</text>
  <text x="${cx + 182}" y="${yCursor}" font-size="13" font-family="${MONO}" fill="${GREEN}">\u2588</text>

</g>
</svg>`;
}

export async function generateCardImage(data: CardData): Promise<Buffer> {
  const svg = buildCardSvg(data);
  const png = await sharp(Buffer.from(svg))
    .resize({ width: 1200 })
    .png()
    .toBuffer();
  return png;
}
