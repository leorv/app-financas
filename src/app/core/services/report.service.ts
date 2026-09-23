import { Injectable } from '@angular/core';
import { utcNow } from '../domain/civil-date';
import { ReportConfig, ReportModel, buildReportModel } from '../domain/report-rules';
import { PersistenceService } from '../persistence/persistence.service';

@Injectable({ providedIn: 'root' })
export class ReportService {
  constructor(private readonly persistence: PersistenceService) {}

  build(config: ReportConfig, generatedAt = utcNow()): ReportModel {
    return buildReportModel(this.persistence.snapshot(), config, generatedAt);
  }
}
