import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ErrorLogService {
  log(error: unknown, context: string): void {
    try {
      const key = 'meu-bolso-error-log';
      const previous = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
      const message = error instanceof Error ? error.message : 'Erro inesperado';
      const next = [...previous, { at: new Date().toISOString(), context, message }].slice(-20);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // O registro de erro nunca deve interromper o fluxo principal.
    }
  }
}
