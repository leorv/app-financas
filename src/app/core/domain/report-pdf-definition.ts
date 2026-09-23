import { createReportChartSvg } from './report-chart';
import { ReportModel, ReportSection } from './report-rules';

export interface ReportPdfDefinition {
  readonly pageSize: 'A4';
  readonly pageOrientation: 'portrait' | 'landscape';
  readonly pageMargins: readonly [number, number, number, number];
  readonly header: (currentPage: number, pageCount: number) => PdfNode;
  readonly footer: (currentPage: number, pageCount: number) => PdfNode;
  readonly content: readonly PdfNode[];
  readonly defaultStyle: PdfNode;
  readonly styles: Readonly<Record<string, PdfNode>>;
  readonly images?: Readonly<Record<string, string>>;
}

export interface PdfNode {
  readonly [key: string]: unknown;
  readonly text?: string | readonly PdfNode[];
  readonly style?: string;
  readonly alignment?: string;
  readonly margin?: readonly number[];
  readonly columns?: readonly PdfNode[];
  readonly stack?: readonly PdfNode[];
  readonly table?: {
    readonly headerRows?: number;
    readonly widths?: readonly (string | number)[];
    readonly body: readonly (readonly (string | PdfNode)[])[];
    readonly dontBreakRows?: boolean;
    readonly keepWithHeaderRows?: number;
  };
  readonly layout?: string;
  readonly image?: string;
  readonly svg?: string;
  readonly fit?: readonly [number, number];
}

export function buildReportPdfDefinition(model: ReportModel): ReportPdfDefinition {
  let chartSvg: string | null = null;
  let chartFailure: string | null = null;
  if (model.chart) {
    try {
      chartSvg = createReportChartSvg(model.chart);
    } catch (error) {
      chartFailure = error instanceof Error ? error.message : 'Falha desconhecida ao converter o gráfico.';
    }
  }

  const warnings = [...model.warnings];
  if (chartFailure) warnings.push(`O gráfico não foi incorporado ao PDF: ${chartFailure} A tabela textual e a descrição alternativa foram mantidas.`);
  const content: PdfNode[] = [
    { text: model.title, style: 'title' },
    { text: `Período: ${model.filters.period} · Moeda: ${model.currency} · Gerado em: ${model.generatedAtLabel}`, style: 'metadata' },
    { text: `Filtros aplicados: conta ${model.filters.account}; cartão ${model.filters.card}; categoria ${model.filters.category}; situações ${model.filters.statuses}; ${model.filters.forecast}; ${model.filters.balances}.`, style: 'metadata', margin: [0, 0, 0, 14] },
  ];
  for (const warning of warnings) content.push({ text: warning, style: 'warning', margin: [0, 0, 0, 8] });
  if (chartFailure && model.chart) content.push({ text: `Descrição alternativa do gráfico: ${model.chart.alternativeText}`, style: 'description', margin: [0, 0, 0, 10] });

  for (const section of model.sections) {
    content.push(sectionNode(section));
    if (section.key === 'chart' && chartSvg) {
      content.push({ svg: chartSvg, fit: [500, 280], margin: [0, 0, 0, 12] });
    }
  }
  if (model.sections.length === 0) content.push({ text: 'Nenhuma seção foi selecionada para este relatório.', style: 'empty' });

  const definition: ReportPdfDefinition = {
    pageSize: 'A4',
    pageOrientation: model.orientation,
    pageMargins: [36, 52, 36, 44],
    header: (currentPage) => ({ text: `${model.title} · ${model.filters.period}`, style: 'header', margin: [36, 22, 36, 0] , alignment: 'right' }),
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: 'Meu Bolso · gerado localmente', style: 'footer' },
        { text: `Página ${currentPage} de ${pageCount}`, style: 'footer', alignment: 'right' },
      ],
      margin: [36, 0, 36, 18],
    }),
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#18322f', lineHeight: 1.15 },
    styles: {
      title: { fontSize: 20, bold: true, color: '#0d4f49', margin: [0, 0, 0, 6] },
      metadata: { fontSize: 9, color: '#536b66' },
      header: { fontSize: 8, color: '#536b66' },
      footer: { fontSize: 8, color: '#536b66' },
      sectionTitle: { fontSize: 13, bold: true, color: '#0d4f49', margin: [0, 14, 0, 4] },
      description: { fontSize: 8, color: '#536b66', margin: [0, 0, 0, 7] },
      tableHeader: { bold: true, color: '#ffffff', fillColor: '#0d6b63', fontSize: 8 },
      warning: { color: '#795400', fillColor: '#fff4d6', margin: [6, 5, 6, 5] },
      empty: { italics: true, color: '#536b66', margin: [0, 0, 0, 8] },
    },
  };
  return definition;
}

function sectionNode(section: ReportSection): PdfNode {
  const nodes: PdfNode[] = [{ text: section.title, style: 'sectionTitle' }];
  if (section.description) nodes.push({ text: section.description, style: 'description' });
  if (section.metrics.length) {
    nodes.push({
      table: {
        widths: ['*', 'auto'],
        body: section.metrics.map((metric) => [
          { text: metric.label },
          { text: metric.value, bold: true, alignment: 'right' },
        ]),
        dontBreakRows: true,
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 9],
    });
  }
  if (section.table) {
    nodes.push({
      table: {
        headerRows: 1,
        widths: section.table.columns.map(() => '*'),
        body: [
          section.table.columns.map((column) => ({ text: column, style: 'tableHeader' })),
          ...section.table.rows.map((row) => row.map((cell) => ({ text: cell }))),
        ],
        dontBreakRows: true,
        keepWithHeaderRows: 1,
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 9],
    });
  } else if (section.emptyMessage) {
    nodes.push({ text: section.emptyMessage, style: 'empty' });
  }
  return { stack: nodes };
}
