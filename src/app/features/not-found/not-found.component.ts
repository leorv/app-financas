import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card"><app-empty-state icon="?" title="Esta página não existe" description="Confira o endereço ou volte para o Dashboard para continuar navegando." actionLabel="Voltar ao Dashboard"></app-empty-state><div style="display:flex;justify-content:center;padding:0 20px 28px"><a routerLink="/dashboard" class="button-primary">Ir para o Dashboard</a></div></section>
  `,
})
export class NotFoundComponent {}
