import sharp from "sharp";

interface CardData {
  displayName: string;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  streak: number;
  date: string;
  branch: string | null;
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

function buildCardSvg(data: CardData): string {
  const W = 840;
  const H = 640;
  const pad = 32;
  const cardR = 16;

  const addStr = `+${formatNumber(data.linesAdded)}`;
  const remStr = `-${formatNumber(data.linesRemoved)}`;
  const dateStr = formatDate(data.date);
  const branchStr = data.branch
    ? escapeXml(data.branch.length > 24 ? data.branch.slice(0, 22) + ".." : data.branch)
    : "main";
  const displayName = escapeXml(
    data.displayName || "developer"
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&amp;display=swap');
      text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" rx="24" fill="#0d0d0d"/>

  <!-- Header text -->
  <text x="${pad}" y="68" fill="#ffffff" font-size="30" font-weight="900" letter-spacing="2">
    PROOF THAT I SHIPPED
  </text>

  <!-- Worktrace badge -->
  <rect x="${pad}" y="86" rx="14" ry="14" width="140" height="32" fill="#1a1a1a" stroke="#333" stroke-width="1"/>
  <text x="58" y="107" fill="#f5c542" font-size="14" font-weight="700">Worktrace</text>
  <text x="${pad + 8}" y="107" fill="#f5c542" font-size="14">&#9733;</text>

  <!-- "TODAY" -->
  <text x="186" y="107" fill="#ffffff" font-size="26" font-weight="900" letter-spacing="2">TODAY</text>

  <!-- Main Stats Card -->
  <rect x="${pad}" y="134" rx="${cardR}" ry="${cardR}" width="${W - pad * 2}" height="200" fill="#f5f5f5"/>

  <!-- Branch label -->
  <text x="${pad + 24}" y="170" fill="#666" font-size="14" font-weight="600" text-transform="uppercase" letter-spacing="1">BRANCH</text>
  <text x="${pad + 24}" y="210" fill="#111" font-size="42" font-weight="900">${branchStr}</text>

  <!-- Lines changed (right side of main card) -->
  <text x="${W - pad - 24}" y="170" fill="#666" font-size="14" font-weight="600" text-anchor="end" letter-spacing="1">CHANGES</text>
  <text x="${W - pad - 24}" y="218" fill="#22863a" font-size="32" font-weight="800" text-anchor="end">${addStr}</text>
  <text x="${W - pad - 24}" y="256" fill="#cb2431" font-size="32" font-weight="800" text-anchor="end">${remStr}</text>

  <!-- Files changed (center of main card) -->
  <text x="${W / 2}" y="280" fill="#666" font-size="14" font-weight="600" text-anchor="middle" letter-spacing="1">${data.filesChanged} FILES CHANGED</text>

  <!-- Bottom row: 3 cards -->
  <!-- Card 1: Display Name -->
  <rect x="${pad}" y="354" rx="${cardR}" ry="${cardR}" width="240" height="170" fill="#f5f5f5"/>
  <text x="${pad + 120}" y="440" fill="#111" font-size="20" font-weight="700" text-anchor="middle">${displayName}</text>
  <circle cx="${pad + 120}" cy="404" r="24" fill="#e0e0e0"/>
  <text x="${pad + 120}" y="412" fill="#666" font-size="22" text-anchor="middle">&#128100;</text>
  <text x="${pad + 120}" y="468" fill="#888" font-size="12" font-weight="600" text-anchor="middle">DEVELOPER</text>

  <!-- Card 2: Files Changed -->
  <rect x="${pad + 260}" y="354" rx="${cardR}" ry="${cardR}" width="240" height="170" fill="#f5f5f5"/>
  <text x="${pad + 380}" y="394" fill="#22863a" font-size="16" font-weight="700" text-anchor="middle">
    <tspan fill="#22863a">${addStr}</tspan>
    <tspan fill="#888"> </tspan>
    <tspan fill="#cb2431">${remStr}</tspan>
  </text>
  <!-- Code icon -->
  <text x="${pad + 350}" y="450" fill="#333" font-size="28">&#128187;</text>
  <text x="${pad + 386}" y="450" fill="#111" font-size="40" font-weight="900">${data.filesChanged}</text>
  <text x="${pad + 380}" y="484" fill="#111" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="1">FILES</text>

  <!-- Card 3: Streak -->
  <rect x="${pad + 520}" y="354" rx="${cardR}" ry="${cardR}" width="240" height="170" fill="#f5f5f5"/>
  <text x="${pad + 640}" y="432" fill="#111" font-size="14" font-weight="700" text-anchor="middle">&#128293;</text>
  <text x="${pad + 640}" y="450" fill="#111" font-size="48" font-weight="900" text-anchor="middle">${data.streak}</text>
  <text x="${pad + 640}" y="484" fill="#111" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="1">DAY STREAK</text>

  <!-- Footer -->
  <text x="${pad}" y="${H - 20}" fill="#888" font-size="14" font-weight="600">${dateStr}</text>
  <text x="${W - pad}" y="${H - 20}" fill="#888" font-size="14" font-weight="600" text-anchor="end">powered by &#9733; Worktrace</text>
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
