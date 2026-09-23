import { Injectable } from '@angular/core';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { buildReportPdfDefinition, ReportPdfDefinition } from '../domain/report-pdf-definition';
import { ReportModel } from '../domain/report-rules';

@Injectable({ providedIn: 'root' })
export class ReportPdfService {
  constructor() {
    pdfMake.addVirtualFileSystem?.(pdfFonts);
  }

  buildDefinition(model: ReportModel): ReportPdfDefinition {
    return buildReportPdfDefinition(model);
  }

  async download(model: ReportModel): Promise<void> {
    if (model.isEmpty) throw new Error('Não há dados compatíveis para gerar este PDF.');
    try {
      const document = pdfMake.createPdf(this.buildDefinition(model));
      await document.download(model.fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida na geração.';
      throw new Error(`Não foi possível gerar o PDF localmente. ${message}`);
    }
  }
}
