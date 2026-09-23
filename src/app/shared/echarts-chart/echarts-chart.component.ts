import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import type { ECharts } from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, AriaComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface EchartsPointClick {
  readonly name: string;
  readonly dataIndex: number;
  readonly seriesName: string;
}

@Component({
  selector: 'app-echarts-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="echarts-host" [attr.role]="'img'" [attr.aria-label]="ariaLabel"></div>`,
})
export class EchartsChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) options!: EChartsOption;
  @Input() ariaLabel = 'Gráfico financeiro';
  @Output() pointClick = new EventEmitter<EchartsPointClick>();
  @ViewChild('host', { static: true }) private readonly host!: ElementRef<HTMLDivElement>;
  private chart: ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.host.nativeElement);
    this.chart.on('click', (params: unknown) => this.emitPoint(params));
    this.chart.setOption(this.options, true);
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] && this.chart) this.chart.setOption(this.options, true);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  private emitPoint(params: unknown): void {
    if (!params || typeof params !== 'object') return;
    const value = params as { name?: unknown; dataIndex?: unknown; seriesName?: unknown };
    this.pointClick.emit({
      name: typeof value.name === 'string' ? value.name : '',
      dataIndex: typeof value.dataIndex === 'number' ? value.dataIndex : -1,
      seriesName: typeof value.seriesName === 'string' ? value.seriesName : '',
    });
  }
}
