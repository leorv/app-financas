import { describe, expect, it } from 'vitest';
import { buildReportPdfDefinition } from './report-pdf-definition';
import { buildReportModel, DEFAULT_REPORT_SECTIONS, ReportModel } from './report-rules';
import { EMPTY_SNAPSHOT } from './models';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.addVirtualFileSystem?.(pdfFonts);

const model = (overrides: Partial<ReportModel> = {}, configOverrides: Partial<Parameters<typeof buildReportModel>[1]> = {}): ReportModel => {
  const built = buildReportModel({
  ...EMPTY_SNAPSHOT,
  accounts: [{ id: 'account', createdAt: '', updatedAt: '', archived: false, name: 'Conta', normalizedName: 'conta', type: 'checking', institution: null, color: '#000', icon: '◉', initialBalanceCents: 10000, isDefault: true }],
  categories: [{ id: 'category', createdAt: '', updatedAt: '', archived: false, type: 'expense', name: 'Casa', normalizedName: 'casa', color: '#0d6b63', icon: '⌂', parentId: null, sortOrder: 0 }],
  transactions: [{ id: 'tx', createdAt: '', updatedAt: '', archived: false, description: 'Aluguel', amountCents: 1000, type: 'expense', movementDate: '2026-09-10', dueDate: null, paymentDate: '2026-09-10', paymentMethod: 'pix', status: 'paid', categoryId: 'category', accountId: 'account', fromAccountId: null, toAccountId: null, creditCardId: null, tags: [], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: null }],
  }, {
  type: 'monthly-summary', from: '2026-09-01', to: '2026-09-30', accountId: null, creditCardId: null, categoryId: null,
  statuses: ['paid'], includeForecast: false, showSensitiveBalances: true, orientation: 'portrait', sections: DEFAULT_REPORT_SECTIONS,
    ...configOverrides,
  }, '2026-09-20T12:00:00.000Z');
  return { ...built, ...overrides };
};

function allText(value: unknown): string {
  return JSON.stringify(value, (_, item) => typeof item === 'function' ? '[function]' : item);
}

describe('estrutura do documento PDF', () => {
  it('define A4, cabeçalho/rodapé, metadados de período e filtros', () => {
    const definition = buildReportPdfDefinition(model());
    expect(definition.pageSize).toBe('A4');
    expect(definition.pageMargins).toEqual([36, 52, 36, 44]);
    expect(definition.header(2, 4).text).toContain('2026');
    expect(allText(definition)).toContain('Moeda: BRL');
    expect(allText(definition)).toContain('Filtros aplicados');
    expect(definition.footer(2, 4).columns?.[1].text).toBe('Página 2 de 4');
  });

  it('repete cabeçalho, mantém linhas inteiras e conserva tabelas longas', () => {
    const definition = buildReportPdfDefinition(model());
    const tables = definition.content.flatMap((node) => collectTables(node));
    expect(tables.some((table) => table.headerRows === 1 && table.keepWithHeaderRows === 1 && table.dontBreakRows === true)).toBe(true);
  });

  it('não materializa saldos ocultos no documento', () => {
    const hidden = model({}, { showSensitiveBalances: false });
    const definition = buildReportPdfDefinition(hidden);
    const text = allText(definition);
    expect(text).not.toContain('Saldo atual');
    expect(text).not.toContain('R$ 100,00');
  });

  it('torna a falha de conversão do gráfico explícita e mantém o texto alternativo', () => {
    const valid = model();
    const failed: ReportModel = {
      ...valid,
      chart: { title: 'Despesas', alternativeText: 'Alternativa textual preservada.', entries: [{ label: 'Inválida', valueCents: -1, percentage: 100, color: '#000000' }] },
    };
    const definition = buildReportPdfDefinition(failed);
    expect(allText(definition)).toContain('O gráfico não foi incorporado ao PDF');
    expect(allText(definition)).toContain('Alternativa textual preservada.');
  });

  it('monta um PDF real offline com fonte local e gráfico SVG local', async () => {
    const document = pdfMake.createPdf(buildReportPdfDefinition(model()));
    const buffer = await document.getBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});

function collectTables(node: unknown): Array<{ headerRows?: number; keepWithHeaderRows?: number; dontBreakRows?: boolean }> {
  if (!node || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  const result: Array<{ headerRows?: number; keepWithHeaderRows?: number; dontBreakRows?: boolean }> = [];
  if (record['table'] && typeof record['table'] === 'object') result.push(record['table'] as { headerRows?: number; keepWithHeaderRows?: number; dontBreakRows?: boolean });
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) for (const item of value) result.push(...collectTables(item));
    else if (value && typeof value === 'object') result.push(...collectTables(value));
  }
  return result;
}
