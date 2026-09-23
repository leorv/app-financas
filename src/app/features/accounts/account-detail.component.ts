import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountService } from '../../core/services/account.service';
import { formatCents } from '../../core/domain/money';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-account-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (account; as current) {
      <app-page-header eyebrow="Detalhe da conta" [title]="current.name" [description]="current.institution || typeLabel(current.type)">
        <a page-actions routerLink="/accounts" class="button-secondary">← Voltar para contas</a>
        <a page-actions routerLink="/transactions" class="button-primary">Ver movimentações</a>
      </app-page-header>
      <div class="grid grid-3">
        <article class="card card-padding"><span class="label">Saldo atual</span><div class="value-xl" [class.negative]="balance() < 0">{{ money(balance()) }}</div><p class="muted small">Saldo inicial + movimentações pagas</p></article>
        <article class="card card-padding"><span class="label">Saldo inicial</span><div class="value-xl">{{ money(current.initialBalanceCents) }}</div><p class="muted small">Valor informado no cadastro</p></article>
        <article class="card card-padding"><span class="label">Situação</span><div class="value-xl" style="font-size: 24px">{{ current.archived ? 'Arquivada' : 'Ativa' }}</div><p class="muted small">{{ current.isDefault ? 'Conta padrão para novos lançamentos' : 'Conta secundária' }}</p></article>
      </div>
      <section class="card" style="margin-top: 18px"><app-empty-state icon="↕" title="Histórico ainda vazio" description="Quando a etapa de movimentações estiver disponível, o histórico filtrado desta conta aparecerá aqui."></app-empty-state></section>
    } @else {
      <section class="card"><app-empty-state icon="?" title="Conta não encontrada" description="Ela pode ter sido removida ou o endereço está incorreto." actionLabel="Voltar para contas"></app-empty-state><div style="display:flex;justify-content:center;padding:0 20px 28px"><a routerLink="/accounts" class="button-primary">Voltar para contas</a></div></section>
    }
  `,
})
export class AccountDetailComponent {
  private readonly route = inject(ActivatedRoute);
  readonly accountService = inject(AccountService);
  readonly account = this.accountService.accounts().find((item) => item.id === this.route.snapshot.paramMap.get('id'));

  balance(): number { return this.account ? this.accountService.balance(this.account) : 0; }
  money(cents: number): string { return formatCents(cents); }
  typeLabel(type: string): string { return ACCOUNT_TYPE_LABELS[type as keyof typeof ACCOUNT_TYPE_LABELS] ?? type; }
}

import { ACCOUNT_TYPE_LABELS } from '../../core/domain/models';
