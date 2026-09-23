import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PersistenceService } from './core/persistence/persistence.service';
import { SettingsService } from './core/services/settings.service';
import { ErrorLogService } from './core/services/error-log.service';
import { NotificationService } from './core/services/notification.service';
import { RecurrenceService } from './core/services/recurrence.service';
import { formatCivilDate, todayCivilDate } from './core/domain/civil-date';

interface NavigationItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-shell">
      <aside class="app-sidenav" [class.open]="menuOpen()" aria-label="Navegação principal">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">$</span>
          <div><div class="brand-name">Meu Bolso</div><div class="brand-caption">finanças sem complicação</div></div>
        </div>
        <nav>
          <div class="nav-section">Visão geral</div>
          @for (item of primaryNavigation; track item.path) {
            <a class="nav-link" [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/dashboard' }" (click)="closeMenu()">
              <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span><span>{{ item.label }}</span>
            </a>
          }
          <div class="nav-section">Planejamento</div>
          @for (item of planningNavigation; track item.path) {
            <a class="nav-link" [routerLink]="item.path" routerLinkActive="active" (click)="closeMenu()">
              <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span><span>{{ item.label }}</span>
            </a>
          }
          <div class="nav-section">Aplicativo</div>
          @for (item of appNavigation; track item.path) {
            <a class="nav-link" [routerLink]="item.path" routerLinkActive="active" (click)="closeMenu()">
              <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span><span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="sidenav-bottom">
          <div class="storage-status">
            <span class="status-dot" [class.error]="persistence.status() === 'error'" aria-hidden="true"></span>
            <span>{{ persistence.status() === 'error' ? 'Armazenamento indisponível' : 'Dados salvos neste dispositivo' }}<br><small>{{ savedLabel() }}</small></span>
          </div>
        </div>
      </aside>

      <main class="app-main">
        <header class="app-toolbar">
          <button type="button" class="icon-button mobile-menu-button" aria-label="Abrir menu" [attr.aria-expanded]="menuOpen()" (click)="toggleMenu()">☰</button>
          <span class="toolbar-date">{{ todayLabel }}</span>
          <span class="toolbar-spacer"></span>
          <a class="icon-button" routerLink="/settings" aria-label="Abrir configurações">⚙</a>
        </header>
        <div class="content"><router-outlet></router-outlet></div>
      </main>
    </div>

    @if (showOnboarding()) {
      <div class="onboarding-backdrop" role="presentation">
        <section class="onboarding" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
          <div class="onboarding-top"><div class="eyebrow">Seu espaço financeiro</div><h1 id="welcome-title">Mais clareza para cuidar do seu dinheiro.</h1></div>
          <div class="onboarding-body">
            <p>O Meu Bolso é privado e funciona direto no seu dispositivo. Seus dados não são enviados para nenhum serviço externo.</p>
            <div class="privacy-note"><span aria-hidden="true">🔒</span><span><strong>Você está no controle.</strong><br><span class="muted small">A qualquer momento, você pode limpar os dados nas configurações.</span></span></div>
            <div class="row">
              <button type="button" class="button-primary" (click)="startNewFile()">Começar um arquivo novo</button>
              <button type="button" class="button-secondary" (click)="openImportExport()">Restaurar backup JSON</button>
            </div>
          </div>
        </section>
      </div>
    }
  `,
})
export class AppComponent implements OnInit {
  readonly menuOpen = signal(false);
  readonly currentUrl = signal('');
  readonly showOnboarding = computed(() => (this.persistence.status() === 'ready' || this.persistence.status() === 'empty') && !this.settings.settings().firstAccessCompleted && !this.currentUrl().startsWith('/import-export'));
  readonly todayLabel = formatCivilDate(todayCivilDate());
  readonly primaryNavigation: NavigationItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: '⌂' },
    { label: 'Movimentações', path: '/transactions', icon: '↕' },
    { label: 'Contas', path: '/accounts', icon: '◉' },
    { label: 'Transferências', path: '/transfers', icon: '⇄' },
    { label: 'Cartões', path: '/cards', icon: '▣' },
    { label: 'Categorias', path: '/categories', icon: '✦' },
  ];
  readonly planningNavigation: NavigationItem[] = [
    { label: 'Orçamentos', path: '/budgets', icon: '◒' },
    { label: 'Metas', path: '/goals', icon: '◇' },
    { label: 'Recorrências', path: '/recurrences', icon: '↻' },
  ];
  readonly appNavigation: NavigationItem[] = [
    { label: 'Importar/exportar', path: '/import-export', icon: '⇄' },
    { label: 'Relatórios', path: '/reports', icon: '▤' },
    { label: 'Configurações', path: '/settings', icon: '⚙' },
  ];

  constructor(
    readonly persistence: PersistenceService,
    private readonly settings: SettingsService,
    private readonly errorLog: ErrorLogService,
    private readonly notifications: NotificationService,
    private readonly recurrenceService: RecurrenceService,
    private readonly router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUrl.set(this.router.url);
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.currentUrl.set(event.urlAfterRedirects);
    });
    await this.persistence.initialize();
    if (this.persistence.status() !== 'error') {
      try {
        await this.recurrenceService.generateAll(addDays(todayCivilDate(), 90));
      } catch (error) {
        this.errorLog.log(error, 'recurrence-generation');
      }
    }
    if (this.persistence.status() === 'error') {
      this.errorLog.log(this.persistence.errorMessage(), 'initialization');
    }
  }

  savedLabel(): string {
    const lastSaved = this.persistence.lastSavedAt();
    if (!lastSaved) {
      return 'ainda não há alterações';
    }
    return `último salvamento: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastSaved))}`;
  }

  toggleMenu(): void { this.menuOpen.update((value) => !value); }
  closeMenu(): void { this.menuOpen.set(false); }

  async startNewFile(): Promise<void> {
    const completed = await this.settings.completeOnboarding();
    if (!completed) {
      this.notifications.error(this.persistence.errorMessage() ?? 'Não foi possível iniciar o arquivo.');
      return;
    }
    await this.router.navigateByUrl('/dashboard');
  }

  async openImportExport(): Promise<void> { await this.router.navigateByUrl('/import-export'); }
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
