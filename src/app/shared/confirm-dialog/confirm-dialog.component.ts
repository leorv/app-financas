import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content><p>{{ data.message }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" mat-button [mat-dialog-close]="false">{{ data.cancelLabel || 'Cancelar' }}</button>
      <button type="button" [class.button-danger]="data.destructive" [class.button-primary]="!data.destructive" mat-button [mat-dialog-close]="true">
        {{ data.confirmLabel || 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: ConfirmDialogData,
    private readonly dialogRef: MatDialogRef<ConfirmDialogComponent>,
  ) {}
}
