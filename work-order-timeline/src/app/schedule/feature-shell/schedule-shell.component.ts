import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ScheduleService } from '../data-access/schedule.service';
import { WorkOrder, WorkOrderStatus } from '../domain/schedule.models';
import { WorkOrderFormPanelComponent } from '../feature-work-order-form/work-order-form-panel.component';
import { TimelineBoardComponent } from '../feature-timeline/timeline-board.component';
import { buildReflowSchedule, generateSyntheticReflowInput, validateSchedule } from '../domain/schedule-engine';
import {
  PanelMode,
  TimelineColumn,
  TimelineDeleteOrderEvent,
  TimelineGridClickEvent,
  TimelineStartEditEvent,
  TimelineToggleMenuEvent,
  TimelineVm,
  TimelineZoomSelectionEvent,
  ZoomConfig,
  ZoomLevel
} from './schedule-shell.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_VIEW_LABEL_INTERVAL = 1;
type ReflowMode = 'automatic' | 'manual';

@Component({
  selector: 'app-schedule-shell',
  standalone: true,
  imports: [CommonModule, TimelineBoardComponent, WorkOrderFormPanelComponent],
  templateUrl: './schedule-shell.component.html',
  styleUrl: './schedule-shell.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ScheduleShellComponent implements AfterViewInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly scheduleService = inject(ScheduleService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly today = startOfDay(new Date());

  protected readonly logoSrc = 'assets/logo.png';

  protected readonly workCenters = this.scheduleService.workCenters;
  protected readonly workOrders = this.scheduleService.workOrders;

  protected readonly zoomOptions: Array<{ value: ZoomLevel; label: string }> = [
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' }
  ];

  protected readonly statusOptions: Array<{ value: WorkOrderStatus; label: string }> = [
    { value: 'open', label: 'Open' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
    { value: 'blocked', label: 'Blocked' }
  ];

  protected readonly zoomLevel = signal<ZoomLevel>('month');
  protected readonly enforceCurrentYearValidation = false;
  protected readonly reflowMode = signal<ReflowMode>('automatic');
  protected readonly timescaleMenuOpen = signal(false);
  protected readonly hoveredWorkCenterId = signal<string | null>(null);
  protected readonly menuOpenFor = signal<string | null>(null);

  protected readonly panelOpen = signal(false);
  protected readonly panelMode = signal<PanelMode>('create');
  protected readonly panelTitle = signal('Work Order Details');
  protected readonly panelPrimaryAction = signal('Create');
  protected readonly submitted = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly editingOrderId = signal<string | null>(null);

  protected readonly orderForm = this.formBuilder.nonNullable.group(
    {
      workOrderNumber: ['', [Validators.required]],
      workCenterId: ['WC-CUT-02', [Validators.required]],
      status: ['open' as WorkOrderStatus, [Validators.required]],
      startDate: [toDateTimeLocalValue(utcDate(2026, 2, 11, 8, 0)), [Validators.required]],
      endDate: [toDateTimeLocalValue(utcDate(2026, 2, 18, 8, 0)), [Validators.required]]
    },
    { validators: [this.validateDateRange] }
  );

  protected readonly timelineVm = computed<TimelineVm>(() => this.buildTimeline(this.zoomLevel()));
  protected readonly ordersByCenter = this.scheduleService.ordersByCenter;
  protected readonly ordersByCenterRecord = computed<Record<string, WorkOrder[]>>(() => {
    const byCenterMap = this.ordersByCenter();
    return Object.fromEntries(this.workCenters().map((center) => [center.id, byCenterMap.get(center.id) ?? []]));
  });
  protected readonly timelineStartMs = computed(() => this.timelineVm().start.getTime());
  protected readonly timelineDayWidth = computed(() => this.timelineVm().dayWidth);

  protected readonly selectedZoomLabel = computed(
    () => this.zoomOptions.find((option) => option.value === this.zoomLevel())?.label ?? 'Week'
  );

  constructor() {
    effect(() => {
      this.zoomLevel();
      queueMicrotask(() => this.centerToday());
    });
    this.exposeDebugTools();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.centerToday(), 0);
  }

  @HostListener('document:click')
  protected closeMenusOnOutsideClick(): void {
    this.menuOpenFor.set(null);
    this.timescaleMenuOpen.set(false);
  }

  protected toggleTimescaleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.timescaleMenuOpen.update((value) => !value);
  }

  protected selectZoom(option: ZoomLevel, event: MouseEvent): void {
    event.stopPropagation();
    this.timescaleMenuOpen.set(false);
    this.zoomLevel.set(option);
  }

  protected onGridClick(event: MouseEvent, workCenterId: string): void {
    const gridElement = event.currentTarget as HTMLElement;
    const clickX = event.clientX - gridElement.getBoundingClientRect().left;
    const vm = this.timelineVm();
    const start = this.resolveDateFromOffset(Math.max(0, clickX), vm);
    if (this.zoomLevel() === 'hour' || this.zoomLevel() === 'day') {
      start.setMinutes(0, 0, 0);
    } else {
      start.setHours(8, 0, 0, 0);
    }

    this.openCreatePanel(workCenterId, start);
  }

  protected openCreatePanel(workCenterId: string, startDate: Date): void {
    const safeStart = clampDate(startDate, this.timelineVm().start, this.timelineVm().end);

    this.panelMode.set('create');
    this.panelTitle.set('Work Order Details');
    this.panelPrimaryAction.set('Create');
    this.editingOrderId.set(null);
    this.submitted.set(false);
    this.formError.set(null);

    const end = addDays(safeStart, 7);
    this.orderForm.reset({
      workOrderNumber: createWorkOrderNumber(this.workOrders()),
      workCenterId,
      status: 'open',
      startDate: toDateTimeLocalValue(safeStart),
      endDate: toDateTimeLocalValue(end)
    });

    this.panelOpen.set(true);
  }

  protected startEdit(order: WorkOrder, event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpenFor.set(null);

    this.panelMode.set('edit');
    this.panelTitle.set('Work Order Details');
    this.panelPrimaryAction.set('Save');
    this.editingOrderId.set(order.docId);
    this.submitted.set(false);
    this.formError.set(null);

    this.orderForm.reset({
      workOrderNumber: order.workOrderNumber,
      workCenterId: order.workCenterId,
      status: order.status,
      startDate: toDateTimeLocalValue(parseIsoDate(order.startDate)),
      endDate: toDateTimeLocalValue(parseIsoDate(order.endDate))
    });

    this.panelOpen.set(true);
  }

  protected deleteOrder(orderId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.scheduleService.deleteWorkOrder(orderId);
    this.menuOpenFor.set(null);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.formError.set(null);
    this.submitted.set(false);
  }

  protected saveOrder(): void {
    this.submitted.set(true);
    this.formError.set(null);

    if (this.orderForm.invalid) {
      return;
    }

    const formValue = this.orderForm.getRawValue();
    const start = parseDateTimeLocal(formValue.startDate);
    const end = parseDateTimeLocal(formValue.endDate);

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      this.formError.set('Invalid date-time format.');
      return;
    }

    if (this.enforceCurrentYearValidation && (!isCurrentYearDate(start, this.today) || !isCurrentYearDate(end, this.today))) {
      this.formError.set('Available only for this year');
      return;
    }

    const payload: WorkOrder = {
      docId: this.editingOrderId() ?? createId(),
      docType: 'workOrder',
      workOrderNumber: formValue.workOrderNumber.trim(),
      manufacturingOrderId: 'MO-106',
      operationNumber: 10,
      operationName: formValue.workOrderNumber.trim(),
      workCenterId: formValue.workCenterId,
      status: formValue.status,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
      isMaintenance: false,
      dependsOnWorkOrderIds: []
    };

    const nextOrders =
      this.panelMode() === 'create'
        ? [...this.workOrders(), payload]
        : this.workOrders().map((order) => (order.docId === payload.docId ? payload : order));

    if (this.reflowMode() === 'manual') {
      if (this.hasOverlap(nextOrders, payload.docId)) {
        this.formError.set('Work order overlaps with an existing order in this work center.');
        return;
      }
      this.scheduleService.replaceWorkOrders(nextOrders);
      this.printReflowTables(
        'MANUAL SAVE',
        {
          totalOrders: nextOrders.length,
          movedOrders: 0,
          totalDelayMinutes: 0,
          averageDelayMinutes: 0,
          maxDelayMinutes: 0,
          runtimeMs: 0
        },
        [],
        0
      );
      this.closePanel();
      return;
    }

    const result = buildReflowSchedule({
      workOrders: nextOrders,
      routings: this.scheduleService.routings(),
      shifts: this.scheduleService.shiftWindows(),
      maintenanceWindows: this.scheduleService.maintenanceWindows()
    });
    const validation = validateSchedule({
      workOrders: result.workOrders,
      routings: this.scheduleService.routings(),
      shifts: this.scheduleService.shiftWindows(),
      maintenanceWindows: this.scheduleService.maintenanceWindows()
    });
    const hardError = validation.issues.find((issue) => issue.severity === 'error');
    if (hardError) {
      this.formError.set(hardError.message);
      this.printReflowTables('AUTO SAVE (FAILED)', result.metrics, result.changes, validation.issues.length);
      return;
    }

    this.scheduleService.replaceWorkOrders(result.workOrders);
    this.printReflowTables('AUTO SAVE', result.metrics, result.changes, validation.issues.length);
    this.closePanel();
  }

  protected toggleMenu(orderId: string, event: Event): void {
    event.stopPropagation();
    this.menuOpenFor.update((current) => (current === orderId ? null : orderId));
  }

  protected getTodayIndicatorLeft(): number {
    const vm = this.timelineVm();
    return ((this.today.getTime() - vm.start.getTime()) / DAY_MS) * vm.dayWidth;
  }

  protected showCurrentMonthBadge(): boolean {
    return this.zoomLevel() === 'month' && this.getCurrentMonthBadgeLeft() !== null;
  }

  protected getCurrentMonthBadgeLeft(): number | null {
    const vm = this.timelineVm();
    let offsetLeft = 0;

    for (const column of vm.columns) {
      const columnStart = startOfDay(column.start);
      const columnEnd = endOfDay(column.end);
      if (this.today >= columnStart && this.today <= columnEnd) {
        return offsetLeft + column.widthPx / 2;
      }

      offsetLeft += column.widthPx;
    }

    return null;
  }

  protected isTodayVisible(): boolean {
    const left = this.getTodayIndicatorLeft();
    return left >= 0 && left <= this.timelineVm().widthPx;
  }

  protected setRowHover(workCenterId: string | null): void {
    this.hoveredWorkCenterId.set(workCenterId);
  }

  protected onTimelineSelectZoom(payload: TimelineZoomSelectionEvent): void {
    this.selectZoom(payload.option, payload.event);
  }

  protected onTimelineGridClick(payload: TimelineGridClickEvent): void {
    this.onGridClick(payload.event, payload.workCenterId);
  }

  protected onTimelineToggleMenu(payload: TimelineToggleMenuEvent): void {
    this.toggleMenu(payload.orderId, payload.event);
  }

  protected onTimelineStartEdit(payload: TimelineStartEditEvent): void {
    this.startEdit(payload.order, payload.event);
  }

  protected onTimelineDeleteOrder(payload: TimelineDeleteOrderEvent): void {
    this.deleteOrder(payload.orderId, payload.event);
  }

  protected runReflowForCurrentSchedule(): void {
    const result = buildReflowSchedule({
      workOrders: this.workOrders(),
      routings: this.scheduleService.routings(),
      shifts: this.scheduleService.shiftWindows(),
      maintenanceWindows: this.scheduleService.maintenanceWindows()
    });

    this.scheduleService.replaceWorkOrders(result.workOrders);
    this.printReflowTables('CURRENT SCHEDULE', result.metrics, result.changes, result.issues.length);
  }

  protected runReflowBenchmark(orderCount = 1000): void {
    const centers = this.workCenters().map((workCenter) => workCenter.id);
    const benchmarkInput = generateSyntheticReflowInput({
      orderCount,
      workCenterIds: centers.length > 0 ? centers : ['WC-1', 'WC-2', 'WC-3'],
      startDate: new Date()
    });

    const result = buildReflowSchedule(benchmarkInput);
    const validation = validateSchedule({
      ...benchmarkInput,
      workOrders: result.workOrders
    });

    this.printReflowTables(`BENCHMARK ${orderCount}`, result.metrics, result.changes, validation.issues.length);
  }

  private centerToday(): void {
    const viewport = this.hostElement.nativeElement.querySelector('.timeline-viewport') as HTMLDivElement | null;

    if (!viewport) {
      return;
    }

    const monthTarget = this.zoomLevel() === 'month' ? this.getCurrentMonthBadgeLeft() : null;
    const anchor = monthTarget ?? (this.isTodayVisible() ? this.getTodayIndicatorLeft() : this.timelineVm().widthPx / 2);
    const target = anchor - viewport.clientWidth / 2;
    viewport.scrollLeft = Math.max(0, target);
  }

  private exposeDebugTools(): void {
    const target = window as Window & {
      scheduleDebug?: {
        runReflow: () => void;
        benchmark: (orderCount?: number) => void;
        setReflowMode: (mode: ReflowMode) => void;
        useDefaultData: () => void;
        useSyntheticData: (orderCount?: number) => void;
        useDatasetUrl: (url: string) => Promise<void>;
        usePagedDatasetUrl: (url: string, pageSize?: number) => Promise<void>;
      };
    };

    target.scheduleDebug = {
      runReflow: () => this.runReflowForCurrentSchedule(),
      benchmark: (orderCount = 1000) => this.runReflowBenchmark(orderCount),
      setReflowMode: (mode: ReflowMode) => this.reflowMode.set(mode),
      useDefaultData: () => this.scheduleService.resetToDefaultDataset(),
      useSyntheticData: (orderCount = 1000) => this.scheduleService.loadSyntheticDataset(orderCount),
      useDatasetUrl: async (url: string) => {
        await this.scheduleService.loadFromUrl(url);
      },
      usePagedDatasetUrl: async (url: string, pageSize = 500) => {
        await this.scheduleService.loadFromPagedUrl(url, pageSize);
      }
    };
  }

  private printReflowTables(
    label: string,
    metrics: { totalOrders: number; movedOrders: number; totalDelayMinutes: number; averageDelayMinutes: number; maxDelayMinutes: number; runtimeMs: number },
    changes: Array<{ workOrderId: string; workOrderNumber: string; workCenterId: string; delayMinutes: number; originalStartDate: string; newStartDate: string }>,
    issueCount: number
  ): void {
    console.group(`Reflow ${label}`);
    console.table([metrics]);
    console.table(
      changes.slice(0, 20).map((change) => ({
        workOrderId: change.workOrderId,
        workOrder: change.workOrderNumber,
        workCenterId: change.workCenterId,
        delayMinutes: change.delayMinutes,
        originalStart: change.originalStartDate,
        newStart: change.newStartDate
      }))
    );
    console.table([{ issueCount }]);
    console.groupEnd();
  }

  private buildTimeline(level: ZoomLevel): TimelineVm {
    const config = this.getZoomConfig(level);
    const bounds = this.resolveTimelineBounds();
    const focusDate = clampDate(this.today, bounds.start, bounds.end);
    let start = bounds.start;
    let end = bounds.end;
    let columns: TimelineColumn[] = [];

    if (level === 'hour') {
      start = startOfDay(focusDate);
      end = startOfDay(focusDate);
      const labelEveryHours = HOUR_VIEW_LABEL_INTERVAL;
      columns = this.buildHourColumns(start, end, config.dayWidth, labelEveryHours);
    }

    if (level === 'day') {
      start = addDays(startOfDay(focusDate), -config.beforeDays);
      end = addDays(startOfDay(focusDate), config.afterDays);
      columns = this.buildDayColumns(start, end, config.dayWidth);
    }

    if (level === 'week') {
      columns = this.buildWeekColumns(start, end, config.dayWidth);
      start = columns[0]?.start ?? start;
      end = columns[columns.length - 1]?.end ?? end;
    }

    if (level === 'month') {
      columns = this.buildMonthColumnsFromRange(start, end, 114);
      start = columns[0]?.start ?? start;
      end = columns[columns.length - 1]?.end ?? end;
    }

    return {
      columns,
      start,
      end,
      dayWidth: config.dayWidth,
      widthPx: columns.reduce((sum, column) => sum + column.widthPx, 0)
    };
  }

  private resolveTimelineBounds(): { start: Date; end: Date } {
    const orders = this.workOrders();
    if (orders.length === 0) {
      return {
        start: startOfYear(addYears(this.today, -1)),
        end: endOfYear(this.today)
      };
    }

    let minStart: Date | null = null;
    let maxEnd: Date | null = null;

    for (const order of orders) {
      const orderStart = parseIsoDate(order.startDate);
      const orderEnd = parseIsoDate(order.endDate);

      if (!minStart || orderStart < minStart) {
        minStart = orderStart;
      }
      if (!maxEnd || orderEnd > maxEnd) {
        maxEnd = orderEnd;
      }
    }

    if (!minStart || !maxEnd) {
      return {
        start: startOfYear(addYears(this.today, -1)),
        end: endOfYear(this.today)
      };
    }

    const rangePaddingDays = 30;
    return {
      start: startOfDay(addDays(minStart, -rangePaddingDays)),
      end: endOfDay(addDays(maxEnd, rangePaddingDays))
    };
  }

  private getZoomConfig(level: ZoomLevel): ZoomConfig {
    if (level === 'hour') {
      return { dayWidth: 3168, beforeDays: 0, afterDays: 0 };
    }

    if (level === 'day') {
      return { dayWidth: 132, beforeDays: 14, afterDays: 14 };
    }

    if (level === 'week') {
      return { dayWidth: 16, beforeDays: 56, afterDays: 56 };
    }

    return { dayWidth: 3.8, beforeDays: 120, afterDays: 120 };
  }

  private buildHourColumns(start: Date, end: Date, dayWidth: number, labelEveryHours: number): TimelineColumn[] {
    const columns: TimelineColumn[] = [];
    let current = startOfDay(start);
    const endInclusive = endOfDay(end);
    const hourWidth = Math.max(dayWidth / 24, 10);
    let index = 0;

    while (current <= endInclusive) {
      const hourEnd = new Date(current.getTime() + 60 * 60 * 1000);
      const shouldLabel = index % labelEveryHours === 0;
      columns.push({
        key: `hour-${current.toISOString()}`,
        label: shouldLabel ? formatHourLabel(current) : '',
        start: current,
        end: hourEnd,
        widthPx: hourWidth
      });

      current = hourEnd;
      index += 1;
    }

    return columns;
  }

  private buildDayColumns(start: Date, end: Date, dayWidth: number): TimelineColumn[] {
    const columns: TimelineColumn[] = [];
    let current = startOfDay(start);
    const endInclusive = startOfDay(end);

    while (current <= endInclusive) {
      columns.push({
        key: `day-${toIsoDate(current)}`,
        label: `${dayOfMonth(current)} ${monthShort(current)}`,
        start: current,
        end: endOfDay(current),
        widthPx: dayWidth
      });

      current = addDays(current, 1);
    }

    return columns;
  }

  private buildWeekColumns(start: Date, end: Date, dayWidth: number): TimelineColumn[] {
    const columns: TimelineColumn[] = [];
    let current = startOfWeek(start);

    while (current <= end) {
      const weekEnd = addDays(current, 6);
      columns.push({
        key: `week-${toIsoDate(current)}`,
        label: `${dayOfMonth(current)} ${monthShort(current)} - ${dayOfMonth(weekEnd)} ${monthShort(weekEnd)}`,
        start: current,
        end: weekEnd,
        widthPx: 7 * dayWidth
      });

      current = addDays(current, 7);
    }

    return columns;
  }

  private validateDateRange(control: AbstractControl): ValidationErrors | null {
    const start = parseDateTimeLocal(control.get('startDate')?.value ?? null);
    const end = parseDateTimeLocal(control.get('endDate')?.value ?? null);

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    if (end <= start) {
      return { dateRange: true };
    }

    return null;
  }

  private hasOverlap(orders: WorkOrder[], orderId: string): boolean {
    const current = orders.find((order) => order.docId === orderId);
    if (!current) {
      return false;
    }

    const currentStart = parseIsoDate(current.startDate);
    const currentEnd = parseIsoDate(current.endDate);

    return orders
      .filter((order) => order.docId !== orderId)
      .filter((order) => order.workCenterId === current.workCenterId)
      .some((order) => {
        const start = parseIsoDate(order.startDate);
        const end = parseIsoDate(order.endDate);
        return currentStart < end && currentEnd > start;
      });
  }

  private buildMonthColumnsFromRange(start: Date, end: Date, monthWidthPx: number): TimelineColumn[] {
    const columns: TimelineColumn[] = [];
    let current = startOfMonth(start);

    while (current <= end) {
      const monthEnd = endOfMonth(current);
      columns.push({
        key: `month-${current.getFullYear()}-${current.getMonth() + 1}`,
        label: `${monthShort(current)} ${current.getFullYear()}`,
        start: current,
        end: monthEnd,
        widthPx: monthWidthPx
      });
      current = addMonths(current, 1);
    }

    return columns;
  }

  private resolveDateFromOffset(offsetX: number, vm: TimelineVm): Date {
    let consumed = 0;
    for (const column of vm.columns) {
      const next = consumed + column.widthPx;
      if (offsetX <= next) {
        const pct = column.widthPx <= 0 ? 0 : (offsetX - consumed) / column.widthPx;
        const spanMs = Math.max(1, column.end.getTime() - column.start.getTime());
        return new Date(column.start.getTime() + Math.floor(pct * spanMs));
      }
      consumed = next;
    }

    return startOfDay(vm.end);
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

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addYears(date: Date, years: number): Date {
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(startOfDay(date), diff);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function monthShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short' });
}

function dayOfMonth(date: Date): number {
  return date.getDate();
}

function formatHourLabel(date: Date): string {
  const hour = String(date.getHours()).padStart(2, '0');
  return `${hour}:00`;
}

function createId(): string {
  return `wo-${Math.random().toString(36).slice(2, 9)}`;
}

function createWorkOrderNumber(orders: WorkOrder[]): string {
  const maxSuffix = orders
    .map((order) => Number(order.workOrderNumber.replace(/[^0-9]/g, '')))
    .filter((value) => Number.isFinite(value))
    .reduce((max, current) => Math.max(max, current), 0);

  return `WO-${String(maxSuffix + 1).padStart(3, '0')}`;
}

function clampDate(value: Date, min: Date, max: Date): Date {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function utcDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

function parseDateTimeLocal(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function isCurrentYearDate(value: Date, today: Date): boolean {
  return value.getFullYear() === today.getFullYear();
}

function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}
