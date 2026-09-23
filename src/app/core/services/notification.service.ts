import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private readonly snackBar: MatSnackBar) {}

  success(message: string): void {
    this.open(message, 'success');
  }

  warning(message: string): void {
    this.open(message, 'warning');
  }

  error(message: string): void {
    this.open(message, 'error');
  }

  private open(message: string, panelClass: string): void {
    this.snackBar.open(message, 'Fechar', {
      duration: 4500,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: [`notification-${panelClass}`],
    });
  }
}
