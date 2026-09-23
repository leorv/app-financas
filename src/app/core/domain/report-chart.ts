import { ReportChartModel } from './report-rules';

export function createReportChartDataUri(chart: ReportChartModel): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createReportChartSvg(chart))}`;
}

export function createReportChartSvg(chart: ReportChartModel): string {
  if (chart.entries.length === 0 || chart.entries.some((entry) => !Number.isFinite(entry.valueCents) || entry.valueCents < 0)) {
    throw new Error('O gráfico não possui dados numéricos válidos.');
  }
  const maximum = Math.max(...chart.entries.map((entry) => entry.valueCents));
  if (maximum <= 0) throw new Error('O gráfico não possui valores positivos para representar.');

  const width = 720;
  const height = 300;
  const chartLeft = 190;
  const chartRight = 28;
  const barHeight = 26;
  const rowGap = 22;
  const top = 32;
  const usableWidth = width - chartLeft - chartRight;
  const rows = chart.entries.map((entry, index) => {
    const y = top + index * (barHeight + rowGap);
    const barWidth = Math.max(2, (entry.valueCents / maximum) * usableWidth);
    return `<text x="${chartLeft - 12}" y="${y + 18}" text-anchor="end" class="label">${escapeXml(entry.label)}</text><rect x="${chartLeft}" y="${y}" width="${barWidth.toFixed(2)}" height="${barHeight}" rx="6" fill="${safeColor(entry.color)}"/><text x="${Math.min(width - 8, chartLeft + barWidth + 8)}" y="${y + 18}" class="value">${escapeXml(formatCents(entry.valueCents))}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.max(height, top + chart.entries.length * (barHeight + rowGap) + 8)}" viewBox="0 0 ${width} ${Math.max(height, top + chart.entries.length * (barHeight + rowGap) + 8)}"><style>.label{font:14px Arial,sans-serif;fill:#18322f}.value{font:13px Arial,sans-serif;fill:#18322f}</style><rect width="100%" height="100%" fill="#ffffff"/>${rows}</svg>`;
  return svg;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
}

function safeColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#0d6b63';
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
