import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/confirm-dialog/confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  constructor(private readonly dialog: MatDialog) {}

  ask(data: ConfirmDialogData): Promise<boolean> {
    return this.dialog.open(ConfirmDialogComponent, {
      width: 'min(440px, calc(100vw - 32px))',
      maxWidth: '100vw',
      data,
      autoFocus: 'dialog',
      restoreFocus: true,
    }).afterClosed().toPromise().then((value) => value === true);
  }
}
