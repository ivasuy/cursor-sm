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
  const H = 640;
  const pad = 32;
  const outerR = 24;
  const F = "'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
  const P = "'Press Start 2P',ui-monospace,'Courier New',monospace";

  const iconDataUri = getIconDataUri();
  const dateStr = formatDate(data.date);
  const safeNameRaw = clampText(data.displayName || "developer", 18);
  const titleText = escapeXml(`${safeNameRaw}'s Session`.toUpperCase());
  const branchRaw = data.branch?.trim() ? data.branch.trim() : "main";

  const addStr = `+${formatNumber(data.linesAdded)}`;
  const remStr = `-${formatNumber(data.linesRemoved)}`;
  const filesStr = formatNumber(data.filesChanged);
  const streakValue = data.durationMins != null && data.durationMins > 0
    ? `${Math.round(data.durationMins)}m`
    : `${formatNumber(data.streak)}d`;
  const streakLabel = data.durationMins != null && data.durationMins > 0
    ? "Session Time"
    : "Streak";

  const readinessScore =
    data.readinessScore != null && Number.isFinite(data.readinessScore)
      ? Math.max(0, Math.min(100, Math.round(data.readinessScore)))
      : null;
  const readinessMain = readinessScore != null ? String(readinessScore) : "N/A";
  const readinessSuffix = readinessScore != null ? "/100" : "";

  const descriptionRaw =
    data.shareableUpdate?.trim() ||
    `Daily coding summary for ${safeNameRaw}. ${addStr} lines added, ${remStr} lines removed, ${filesStr} files changed on ${branchRaw}.`;
  const descriptionLines = wrapTextLines(descriptionRaw, 72, 4);

  const topFileText =
    data.topFiles && data.topFiles.length > 0
      ? `Top file: ${fileBaseName(data.topFiles[0])}`
      : dateStr;
  const footerLeft = escapeXml(clampText(topFileText, 38));

  const cardX = 92;
  const cardY = 52;
  const cardW = W - cardX * 2;
  const cardH = 536;
  const cardR = 20;
  const shadowOffset = 12;
  const headerH = 96;
  const bodyX = cardX + 28;
  const bodyW = cardW - 56;
  const descStartY = cardY + headerH + 38;
  const descLineH = 24;
  const descBlockH = descLineH * 4;

  const gridGap = 14;
  const featureW = Math.floor((bodyW - gridGap) / 2);
  const featureH = 84;
  const gridY = descStartY + descBlockH + 20;

  const actionY = gridY + featureH * 2 + gridGap + 22;

  const logoX = cardX + 20;
  const logoY = cardY + 22;
  const logoSize = 50;

  const featureItems: Array<{
    label: string;
    value: string;
    iconPath: string;
    color: string;
    valueColor: string;
  }> = [
    {
      label: "Lines Added",
      value: addStr,
      iconPath:
        "M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
      color: "#22863a",
      valueColor: "#22863a",
    },
    {
      label: "Lines Removed",
      value: remStr,
      iconPath:
        "M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
      color: "#cb2431",
      valueColor: "#cb2431",
    },
    {
      label: "Files Changed",
      value: filesStr,
      iconPath:
        "M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z",
      color: "#4d61ff",
      valueColor: "#4d61ff",
    },
    {
      label: streakLabel,
      value: streakValue,
      iconPath:
        "M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z",
      color: "#f59e0b",
      valueColor: "#f59e0b",
    },
  ];

  const featuresSvg = featureItems
    .map((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = bodyX + col * (featureW + gridGap);
      const y = gridY + row * (featureH + gridGap);
      const iconY = y + (featureH - 36) / 2 - 12;
      const textCenterY = y + featureH / 2;
      return `
      <g>
        <rect x="${x}" y="${y}" rx="10" ry="10" width="${featureW}" height="${featureH}" fill="#ffffff" stroke="#d5d1c8" stroke-width="2"/>
        <rect x="${x + 14}" y="${iconY}" rx="6" ry="6" width="36" height="36" fill="${item.color}"/>
        <svg x="${x + 20}" y="${iconY + 6}" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="${item.iconPath}" stroke="#f8f7f2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <text x="${x + 62}" y="${textCenterY - 4}" fill="${item.valueColor}" font-size="26" font-weight="800" font-family="${F}">${escapeXml(item.value)}</text>
        <text x="${x + 62}" y="${textCenterY + 18}" fill="#6f6a60" font-size="9" letter-spacing="1.2" font-family="${P}">${escapeXml(item.label.toUpperCase())}</text>
      </g>`;
    })
    .join("");

  const descriptionSvg = descriptionLines
    .map(
      (line, i) =>
        `<text x="${bodyX + bodyW / 2}" y="${descStartY + i * descLineH}" text-anchor="middle" fill="#2b2b2b" font-size="16" font-weight="500" font-family="${F}">${escapeXml(line)}</text>`
    )
    .join("");

  const logoSvg = iconDataUri
    ? `<image href="${iconDataUri}" x="${logoX + 7}" y="${logoY + 7}" width="${logoSize - 14}" height="${logoSize - 14}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${logoX + logoSize / 2}" y="${logoY + 34}" text-anchor="middle" fill="#f5c542" font-size="22" font-weight="700" font-family="${F}">&#9733;</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&amp;family=Inter:wght@400;500;600;700;800;900&amp;display=swap');
    text { font-family: ${F}; }
  </style>
  <clipPath id="outer"><rect width="${W}" height="${H}" rx="${outerR}"/></clipPath>
  <clipPath id="cardClip"><rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}"/></clipPath>
  <clipPath id="cardBodyClip"><rect x="${cardX}" y="${cardY + headerH}" width="${cardW}" height="${cardH - headerH}"/></clipPath>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a0a0a"/>
    <stop offset="100%" stop-color="#0e0e0e"/>
  </linearGradient>
  <radialGradient id="orb" cx="0%" cy="100%" r="80%">
    <stop offset="0%" stop-color="#666666" stop-opacity="0.14"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
  </radialGradient>
  <pattern id="sceneGrid" width="24" height="24" patternUnits="userSpaceOnUse">
    <path d="M24 0H0V24" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
  </pattern>
  <pattern id="cardPatternGrid" width="10" height="10" patternUnits="userSpaceOnUse">
    <path d="M10 0H0V10" fill="none" stroke="#000000" stroke-opacity="0.06" stroke-width="1"/>
  </pattern>
  <pattern id="cardPatternDots" width="16" height="16" patternUnits="userSpaceOnUse">
    <circle cx="3" cy="3" r="1.2" fill="#cfcfcf"/>
  </pattern>
</defs>
<g clip-path="url(#outer)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#sceneGrid)"/>
  <circle cx="120" cy="${H - 30}" r="180" fill="url(#orb)"/>

  <!-- Background decorative shapes -->
  <rect x="45" y="180" width="52" height="52" fill="#4d61ff" opacity="0.6" transform="rotate(45 71 206)"/>
  <rect x="28" y="420" width="38" height="38" fill="#f8f7f2" opacity="0.7" transform="rotate(-12 47 439)"/>
  <rect x="${W - 70}" y="100" width="36" height="36" fill="#00e0b0" opacity="0.5" transform="rotate(30 ${W - 52} 118)"/>
  <rect x="${W - 55}" y="${H - 140}" width="44" height="44" fill="#f5c542" opacity="0.5" transform="rotate(45 ${W - 33} ${H - 118})"/>
  <rect x="60" y="${H - 100}" width="28" height="28" fill="#4d61ff" opacity="0.4" transform="rotate(20 74 ${H - 86})"/>
  <rect x="${W - 90}" y="320" width="24" height="24" fill="#f8f7f2" opacity="0.5" transform="rotate(-8 ${W - 78} 332)"/>
  <rect x="35" y="80" width="18" height="18" fill="#00e0b0" opacity="0.35" transform="rotate(45 44 89)"/>
  <rect x="${W - 45}" y="480" width="20" height="20" fill="#cb2431" opacity="0.3" transform="rotate(15 ${W - 35} 490)"/>

  <rect x="${cardX + shadowOffset}" y="${cardY + shadowOffset}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#000000"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#f8f7f2" stroke="#d5d1c8" stroke-width="2" stroke-linejoin="round"/>
  <rect x="${cardX}" y="${cardY + headerH}" width="${cardW}" height="${cardH - headerH}" fill="url(#cardPatternGrid)" clip-path="url(#cardBodyClip)" opacity="0.45"/>
  <rect x="${cardX}" y="${cardY + headerH}" width="${cardW}" height="${cardH - headerH}" fill="url(#cardPatternDots)" clip-path="url(#cardBodyClip)" opacity="0.2"/>

  <rect x="${cardX + cardW - 24}" y="${cardY - 22}" width="72" height="72" fill="#f5c542" transform="rotate(45 ${cardX + cardW + 12} ${cardY + 14})"/>
  <text x="${cardX + cardW - 16}" y="${cardY + 26}" fill="#111111" font-size="20" font-weight="800" font-family="${F}">&#9733;</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${headerH}" fill="#121210" clip-path="url(#cardClip)"/>
  <line x1="${cardX}" y1="${cardY + headerH}" x2="${cardX + cardW}" y2="${cardY + headerH}" stroke="#d5d1c8" stroke-width="1"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="none" stroke="#d5d1c8" stroke-width="2"/>

  <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="10" ry="10" fill="#0d0d0d" stroke="#f5c542" stroke-width="2"/>
  ${logoSvg}

  <text x="${logoX + logoSize + 16}" y="${cardY + 52}" fill="#ffffff" font-size="24" font-weight="800" font-family="${F}">${titleText}</text>
  <text x="${logoX + logoSize + 16}" y="${cardY + 76}" fill="#9b988f" font-size="11" letter-spacing="1.2" font-family="${P}">${escapeXml(dateStr.toUpperCase())}</text>

  ${descriptionSvg}
  ${featuresSvg}

  <line x1="${bodyX}" y1="${actionY}" x2="${bodyX + bodyW}" y2="${actionY}" stroke="#000000" stroke-opacity="0.16" stroke-width="2" stroke-dasharray="7 7"/>
  <text x="${bodyX + bodyW / 2}" y="${actionY + 4}" text-anchor="middle" fill="#7a756d" font-size="20" font-family="${F}">&#9986;</text>

  <rect x="${bodyX}" y="${actionY + 50}" width="92" height="10" fill="#00e0b0" opacity="0.45"/>
  <text x="${bodyX}" y="${actionY + 48}" fill="#111111" font-size="46" font-weight="900" font-family="${F}">
    <tspan>${escapeXml(readinessMain)}</tspan>
    <tspan dx="4" font-size="18" fill="#6f6a60">${escapeXml(readinessSuffix)}</tspan>
  </text>
  <text x="${bodyX}" y="${actionY + 74}" fill="#6f6a60" font-size="10" letter-spacing="1.3" font-family="${P}">READINESS SCORE</text>

  <g opacity="0.3" transform="translate(${cardX - 14} ${cardY + cardH - 124}) rotate(-10)">
    <circle fill="#000000" r="3" cy="10" cx="10"/>
    <circle fill="#000000" r="3" cy="10" cx="30"/>
    <circle fill="#000000" r="3" cy="10" cx="50"/>
    <circle fill="#000000" r="3" cy="10" cx="70"/>
    <circle fill="#000000" r="3" cy="20" cx="20"/>
    <circle fill="#000000" r="3" cy="20" cx="40"/>
    <circle fill="#000000" r="3" cy="20" cx="60"/>
    <circle fill="#000000" r="3" cy="30" cx="10"/>
    <circle fill="#000000" r="3" cy="30" cx="30"/>
    <circle fill="#000000" r="3" cy="30" cx="50"/>
    <circle fill="#000000" r="3" cy="30" cx="70"/>
  </g>

  <rect x="${bodyX}" y="${descStartY + descBlockH + 6}" width="${bodyW}" height="2" fill="#121210" opacity="0.08"/>
  <circle cx="${bodyX + 8}" cy="${actionY + 42}" r="6" fill="#4d61ff" opacity="0.18"/>
  <rect x="${cardX + cardW - 36}" y="${cardY + cardH - 96}" width="24" height="6" rx="3" ry="3" fill="#f5c542" opacity="0.2"/>

  <text x="${pad}" y="${H - 18}" fill="#5f5f5f" font-size="11" font-weight="500" font-family="${F}">${footerLeft}</text>
  <text x="${W - pad}" y="${H - 18}" fill="#5f5f5f" font-size="11" font-weight="500" text-anchor="end" font-family="${F}">powered by &#9733; Worktrace</text>
</g>
</svg>`;
}

export async function generateCardImage(data: CardData): Promise<Buffer> {
  const svg = buildCardSvg(data);
  const png = await sharp(Buffer.from(svg))
    .resize(1200, 914)
    .png()
    .toBuffer();
  return png;
}
