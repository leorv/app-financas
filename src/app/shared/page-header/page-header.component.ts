import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div>
        @if (eyebrow) { <div class="eyebrow">{{ eyebrow }}</div> }
        <h1>{{ title }}</h1>
        @if (description) { <p class="page-description">{{ description }}</p> }
      </div>
      <div class="page-actions"><ng-content select="[page-actions]"></ng-content></div>
    </header>
  `,
})
export class PageHeaderComponent {
  @Input({ required: true }) title = '';
  @Input() description = '';
  @Input() eyebrow = '';
}
