export type BadgeItem = 'tokens' | 'cost' | 'dateRange';
export type BadgeTheme = 'flat' | 'pixel' | 'dark';

export interface BadgeData {
  tokens: number;
  costUSD: number;
  requests: number;
  dateRange: { start: string; end: string };
}

export interface BadgeOptions {
  theme: BadgeTheme;
  items: BadgeItem[];
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export function formatCost(cost: number): string {
  return `$${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const sMonth = months[s.getMonth()];
  const eMonth = months[e.getMonth()];
  const sDay = s.getDate();
  const eDay = e.getDate();

  if (sMonth === eMonth) {
    return `${sMonth} ${sDay}\u2013${eDay}`;
  }
  return `${sMonth} ${sDay} \u2013 ${eMonth} ${eDay}`;
}

export function formatRequests(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString('en-US');
}

function buildValue(data: BadgeData, items: BadgeItem[]): string {
  const parts: string[] = [];
  for (const item of items) {
    switch (item) {
      case 'tokens':
        parts.push(formatTokens(data.tokens));
        break;
      case 'cost':
        parts.push(formatCost(data.costUSD));
        break;
      case 'dateRange':
        parts.push(formatDateRange(data.dateRange.start, data.dateRange.end));
        break;
    }
  }
  return parts.join(' \u00b7 ');
}

function renderFlat(label: string, value: string): string {
  const labelWidth = label.length * 6.5 + 20;
  const valueWidth = value.length * 6.5 + 20;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#4c1"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

function renderPixel(label: string, value: string): string {
  const charWidth = 7.2;
  const padding = 16;
  const gap = 12;
  const labelWidth = label.length * charWidth + padding;
  const valueWidth = value.length * charWidth + padding;
  const totalWidth = labelWidth + gap + valueWidth + padding;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="22" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <rect x="0.5" y="0.5" width="${totalWidth - 1}" height="21" fill="#fff" stroke="#000" stroke-width="1"/>
  <g font-family="'Consolas','Monaco','Courier New',monospace" font-size="12" fill="#000">
    <text x="${padding / 2}" y="15">${label}</text>
    <text x="${labelWidth + gap}" y="15">${value}</text>
  </g>
</svg>`;
}

function renderDark(data: BadgeData): string {
  const width = 240;
  const height = 152;
  const rx = 10;
  const px = 20;  // horizontal padding
  const labelX = px;
  const valueX = width - px;

  const title = 'AI Token Usage (7d)';
  const rows = [
    { label: 'Tokens', value: formatTokens(data.tokens) },
    { label: 'Cost', value: formatCost(data.costUSD) },
    { label: 'Requests', value: formatRequests(data.requests) },
    { label: 'Period', value: formatDateRange(data.dateRange.start, data.dateRange.end) },
  ];

  const titleY = 30;
  const dividerY = 42;
  const rowStartY = 64;
  const rowGap = 24;

  const rowsSvg = rows.map((r, i) => {
    const y = rowStartY + i * rowGap;
    return `    <text x="${labelX}" y="${y}" fill="#a3a3a3" font-size="12">${r.label}</text>
    <text x="${valueX}" y="${y}" fill="#f5f5f5" font-size="12" text-anchor="end" font-family="'SF Mono','Cascadia Code','Consolas',monospace">${r.value}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${title}">
  <title>${title}</title>
  <rect width="${width}" height="${height}" rx="${rx}" fill="#171717"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${rx}" fill="none" stroke="#333" stroke-width="1"/>
  <g font-family="'Inter','SF Pro Display',-apple-system,'Segoe UI',sans-serif">
    <text x="${labelX}" y="${titleY}" fill="#f5f5f5" font-size="13" font-weight="500">${title}</text>
    <line x1="${labelX}" y1="${dividerY}" x2="${width - px}" y2="${dividerY}" stroke="#333" stroke-width="1"/>
${rowsSvg}
  </g>
</svg>`;
}

export function generateBadge(data: BadgeData, options?: Partial<BadgeOptions>): string {
  const theme = options?.theme ?? 'flat';
  const items = options?.items ?? ['tokens'];
  const label = 'Token Usage (7d)';
  const value = buildValue(data, items);

  if (theme === 'dark') {
    return renderDark(data);
  }
  if (theme === 'pixel') {
    return renderPixel(label, value);
  }
  return renderFlat(label, value);
}

export function generateBadges(data: BadgeData): Record<string, string> {
  return {
    'token-usage.svg': generateBadge(data, { theme: 'flat', items: ['tokens'] }),
    'token-usage-pixel.svg': generateBadge(data, { theme: 'pixel', items: ['tokens'] }),
    'token-usage-cost.svg': generateBadge(data, { theme: 'flat', items: ['tokens', 'cost'] }),
    'token-usage-cost-pixel.svg': generateBadge(data, { theme: 'pixel', items: ['tokens', 'cost'] }),
    'token-usage-dark.svg': generateBadge(data, { theme: 'dark' }),
  };
}
