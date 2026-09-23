import { Injectable, computed, effect } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { ThemePreference } from '../domain/models';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = computed(() => this.persistence.snapshot().settings);
  readonly theme = computed(() => this.settings().theme);

  constructor(private readonly persistence: PersistenceService) {
    effect(() => this.applyTheme(this.theme()));
  }

  async completeOnboarding(): Promise<boolean> {
    return this.persistence.updateSettings({ firstAccessCompleted: true });
  }

  async setTheme(theme: ThemePreference): Promise<boolean> {
    return this.persistence.updateSettings({ theme });
  }

  private applyTheme(theme: ThemePreference): void {
    if (typeof document === 'undefined') {
      return;
    }
    const resolved = theme === 'system'
      ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.dataset['theme'] = resolved;
    document.documentElement.dataset['theme-preference'] = theme;
  }
}
