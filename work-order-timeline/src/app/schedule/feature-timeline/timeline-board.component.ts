import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { WorkCenter, WorkOrder, WorkOrderStatus } from '../domain/schedule.models';
import {
  TimelineDeleteOrderEvent,
  TimelineGridClickEvent,
  TimelineStartEditEvent,
  TimelineToggleMenuEvent,
  TimelineVm,
  TimelineZoomSelectionEvent,
  ZoomLevel
} from '../feature-shell/schedule-shell.types';

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-timeline-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline-board.component.html'
})
export class TimelineBoardComponent implements OnChanges, AfterViewInit {
  private readonly rowHeight = 48;
  private readonly headerHeight = 33;
  private readonly rowOverscan = 6;

  @ViewChild('timelineViewport') private timelineViewport?: ElementRef<HTMLDivElement>;

  @Input({ required: true }) logoSrc = '';
  @Input({ required: true }) selectedZoomLabel = '';
  @Input({ required: true }) zoomOptions: Array<{ value: ZoomLevel; label: string }> = [];
  @Input({ required: true }) zoomLevel: ZoomLevel = 'month';
  @Input({ required: true }) timescaleMenuOpen = false;
  @Input({ required: true }) workCenters: WorkCenter[] = [];
  @Input({ required: true }) timelineVm!: TimelineVm;
  @Input({ required: true }) hoveredWorkCenterId: string | null = null;
  @Input({ required: true }) menuOpenFor: string | null = null;
  @Input({ required: true }) showCurrentMonthBadge = false;
  @Input({ required: true }) currentMonthBadgeLeft: number | null = null;
  @Input({ required: true }) todayVisible = false;
  @Input({ required: true }) todayIndicatorLeft = 0;
  @Input({ required: true }) timelineStartMs = 0;
  @Input({ required: true }) timelineDayWidth = 0;
  @Input({ required: true }) statusOptions: Array<{ value: WorkOrderStatus; label: string }> = [];
  @Input({ required: true }) ordersByCenter: Record<string, WorkOrder[]> = {};

  @Output() toggleTimescaleMenu = new EventEmitter<MouseEvent>();
  @Output() selectZoom = new EventEmitter<TimelineZoomSelectionEvent>();
  @Output() rowHover = new EventEmitter<string | null>();
  @Output() gridClick = new EventEmitter<TimelineGridClickEvent>();
  @Output() toggleMenu = new EventEmitter<TimelineToggleMenuEvent>();
  @Output() startEdit = new EventEmitter<TimelineStartEditEvent>();
  @Output() deleteOrder = new EventEmitter<TimelineDeleteOrderEvent>();

  protected topSpacerHeight = 0;
  protected bottomSpacerHeight = 0;
  protected visibleWorkCenters: WorkCenter[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['workCenters']) {
      this.updateVisibleRows();
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.updateVisibleRows(), 0);
  }

  onSelectZoom(option: ZoomLevel, event: MouseEvent): void {
    this.selectZoom.emit({ option, event });
  }

  onBarClick(orderId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.toggleMenu.emit({ orderId, event });
  }

  onBarKeydown(orderId: string, event: KeyboardEvent): void {
    const key = event.key;
    if (key !== 'Enter' && key !== ' ') {
      return;
    }
    event.preventDefault();
    this.toggleMenu.emit({ orderId, event });
  }

  ordersForCenter(workCenterId: string): WorkOrder[] {
    const rangeStartMs = this.timelineStartMs;
    const rangeEndMs = this.timelineVm.end.getTime();

    return (this.ordersByCenter[workCenterId] ?? []).filter((order) => {
      const orderStartMs = parseIsoDate(order.startDate).getTime();
      const orderEndMs = parseIsoDate(order.endDate).getTime();
      return orderEndMs >= rangeStartMs && orderStartMs <= rangeEndMs;
    });
  }

  hasOpenMenuForCenter(workCenterId: string): boolean {
    const openId = this.menuOpenFor;
    if (!openId) {
      return false;
    }

    return this.ordersForCenter(workCenterId).some((order) => order.docId === openId);
  }

  getBarLeft(order: WorkOrder): number {
    const { clippedStartMs } = this.getClippedOrderRange(order);
    return ((clippedStartMs - this.timelineStartMs) / DAY_MS) * this.timelineDayWidth;
  }

  getBarWidth(order: WorkOrder): number {
    const { clippedStartMs, clippedEndMs } = this.getClippedOrderRange(order);
    const durationDays = Math.max((clippedEndMs - clippedStartMs) / DAY_MS, 0.2);
    return Math.max(durationDays * this.timelineDayWidth - 8, 28);
  }

  getStatusLabel(status: WorkOrderStatus): string {
    const found = this.statusOptions.find((option) => option.value === status);
    return found?.label ?? status;
  }

  protected onViewportScroll(event: Event): void {
    this.updateVisibleRows(event.target as HTMLDivElement);
  }

  private updateVisibleRows(explicitViewport?: HTMLDivElement): void {
    const viewport = explicitViewport ?? this.timelineViewport?.nativeElement;
    const totalRows = this.workCenters.length;
    if (!viewport || totalRows === 0) {
      this.visibleWorkCenters = this.workCenters;
      this.topSpacerHeight = 0;
      this.bottomSpacerHeight = 0;
      return;
    }

    const rowsViewportHeight = Math.max(viewport.clientHeight - this.headerHeight, this.rowHeight);
    const firstVisible = Math.max(0, Math.floor(viewport.scrollTop / this.rowHeight));
    const visibleCount = Math.ceil(rowsViewportHeight / this.rowHeight) + this.rowOverscan * 2;
    const startIndex = Math.max(0, firstVisible - this.rowOverscan);
    const endIndex = Math.min(totalRows, startIndex + visibleCount);

    this.visibleWorkCenters = this.workCenters.slice(startIndex, endIndex);
    this.topSpacerHeight = startIndex * this.rowHeight;
    this.bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * this.rowHeight);
  }

  private getClippedOrderRange(order: WorkOrder): { clippedStartMs: number; clippedEndMs: number } {
    const rangeStartMs = this.timelineStartMs;
    const rangeEndMs = this.timelineVm.end.getTime();
    const orderStartMs = parseIsoDate(order.startDate).getTime();
    const orderEndMs = parseIsoDate(order.endDate).getTime();

    const clippedStartMs = Math.max(orderStartMs, rangeStartMs);
    const clippedEndMs = Math.min(orderEndMs, rangeEndMs);

    return {
      clippedStartMs,
      clippedEndMs: Math.max(clippedEndMs, clippedStartMs + 1)
    };
  }
}

function parseIsoDate(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}
