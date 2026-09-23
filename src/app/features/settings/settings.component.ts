import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SettingsService } from '../../core/services/settings.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ThemePreference } from '../../core/domain/models';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { NotificationService } from '../../core/services/notification.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header eyebrow="Preferências" title="Configurações" description="Ajuste a experiência e cuide do armazenamento local."></app-page-header>
    <div class="grid grid-2">
      <section class="card card-padding">
        <h2>Aparência</h2><p class="muted small">Essa preferência só muda a interface, nunca os cálculos financeiros.</p>
        <div class="field" style="margin-top: 20px"><label for="theme">Tema</label><select id="theme" [value]="settingsService.theme()" (change)="setTheme($event)"><option value="system">Conforme o sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></div>
        <div class="field" style="margin-top: 20px"><label>Moeda</label><div class="field input" style="align-items:center;display:flex;min-height:44px">R$ — Real brasileiro (BRL)</div></div>
        <div class="field" style="margin-top: 20px"><label>Localidade</label><div class="field input" style="align-items:center;display:flex;min-height:44px">pt-BR — Português do Brasil</div></div>
      </section>
      <section class="card card-padding">
        <h2>Armazenamento</h2><p class="muted small">Seus dados ficam no IndexedDB deste navegador e não são enviados para serviços externos.</p>
        <div class="privacy-note" style="margin-top:20px"><span aria-hidden="true">◉</span><span><strong>{{ persistence.status() === 'error' ? 'Atenção ao armazenamento' : 'Armazenamento local ativo' }}</strong><br><span class="muted small">{{ savedLabel() }}</span></span></div>
        @if (persistence.status() === 'error') { <div class="danger-note small" role="alert">{{ persistence.errorMessage() }}<br>Suas alterações continuam na tela quando possível; tente novamente depois.</div> }
        <div class="form-actions" style="justify-content:flex-start;margin-top:20px"><button type="button" class="button-secondary" (click)="reload()">Recarregar dados</button><button type="button" class="button-danger" (click)="clearData()">Limpar todos os dados</button></div>
      </section>
    </div>
  `,
})
export class SettingsComponent {
  readonly settingsService = inject(SettingsService);
  readonly persistence = inject(PersistenceService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly notifications = inject(NotificationService);

  async setTheme(event: Event): Promise<void> {
    const theme = (event.target as HTMLSelectElement).value as ThemePreference;
    const saved = await this.settingsService.setTheme(theme);
    if (!saved) this.notifications.error(this.persistence.errorMessage() ?? 'Não foi possível salvar o tema.');
  }

  savedLabel(): string {
    const saved = this.persistence.lastSavedAt();
    return saved ? `Último salvamento: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(saved))}` : 'Ainda não há alterações salvas.';
  }

  async clearData(): Promise<void> {
    const proceed = await this.confirm.ask({ title: 'Limpar todos os dados?', message: 'Contas, categorias e demais registros locais serão removidos deste navegador. Essa ação exige um backup prévio se você quiser recuperar os dados.', confirmLabel: 'Limpar dados', destructive: true });
    if (!proceed) return;
    const cleared = await this.persistence.clear();
    if (cleared) this.notifications.success('Dados limpos. Você voltou ao primeiro acesso.');
    else this.notifications.error(this.persistence.errorMessage() ?? 'Não foi possível limpar os dados.');
  }

  reload(): void { void this.persistence.initialize(); }
}
