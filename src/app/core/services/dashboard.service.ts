import { Injectable, computed } from '@angular/core';
import { todayCivilDate } from '../domain/civil-date';
import { DashboardPeriod, DashboardSummary, consolidateDashboard } from '../domain/dashboard-rules';
import { PersistenceService } from '../persistence/persistence.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  readonly data = computed(() => this.persistence.snapshot());

  constructor(private readonly persistence: PersistenceService) {}

  consolidate(period: DashboardPeriod, today = todayCivilDate()): DashboardSummary {
    const snapshot = this.data();
    return consolidateDashboard(snapshot.transactions, snapshot.accounts, snapshot.categories, period, today);
  }
}
