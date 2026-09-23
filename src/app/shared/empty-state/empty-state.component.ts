import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="empty-state" [attr.aria-label]="title">
      <div class="empty-icon" aria-hidden="true">{{ icon }}</div>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      @if (actionLabel) {
        <button type="button" class="button-primary" (click)="action.emit()">{{ actionLabel }}</button>
      }
    </section>
  `,
})
export class EmptyStateComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() icon = '○';
  @Input() actionLabel = '';
  @Output() readonly action = new EventEmitter<void>();
}
