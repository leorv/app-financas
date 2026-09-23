import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [eyebrow]="'Próxima etapa'" [title]="title" [description]="description"></app-page-header>
    <section class="card"><app-empty-state [icon]="icon" title="Este espaço está preparado" description="A navegação e a experiência base já estão disponíveis. O cadastro completo será implementado na etapa funcional correspondente." actionLabel="Voltar ao Dashboard" (action)="goHome()"></app-empty-state></section>
  `,
})
export class PlaceholderComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly title = String(this.route.snapshot.data['title'] ?? 'Em breve');
  readonly description = String(this.route.snapshot.data['description'] ?? '');
  readonly icon = String(this.route.snapshot.data['icon'] ?? '○');

  goHome(): void { void this.router.navigateByUrl('/dashboard'); }
}
