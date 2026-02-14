import { Injectable, computed, signal } from '@angular/core';
import { ApiPagedScheduleDatasetResponse, ApiScheduleDataset } from './schedule.api';
import { mapApiToDomain } from './schedule.mapper';
import { MaintenanceWindow, ManufacturingOrder, Routing, ShiftWindow, WorkCenter, WorkOrder } from '../domain/schedule.models';
import { generateSyntheticReflowInput } from '../domain/schedule-engine';
import {
  SCHEDULE_DATA_SOURCE_CONFIG,
  ScheduleDataSourceConfig,
  ScheduleDataSourceMode
} from './schedule.datasource.config';

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly dataSourceConfig: ScheduleDataSourceConfig = SCHEDULE_DATA_SOURCE_CONFIG;
  private readonly _workCenters = signal<WorkCenter[]>([]);
  private readonly _manufacturingOrders = signal<ManufacturingOrder[]>([]);
  private readonly _routings = signal<Routing[]>([]);
  private readonly _workOrders = signal<WorkOrder[]>([]);
  private readonly _shiftWindows = signal<ShiftWindow[]>([]);
  private readonly _maintenanceWindows = signal<MaintenanceWindow[]>([]);
  private readonly _activeDataSourceMode = signal<ScheduleDataSourceMode>(this.dataSourceConfig.mode);

  readonly workCenters = this._workCenters.asReadonly();
  readonly manufacturingOrders = this._manufacturingOrders.asReadonly();
  readonly routings = this._routings.asReadonly();
  readonly workOrders = this._workOrders.asReadonly();
  readonly shiftWindows = this._shiftWindows.asReadonly();
  readonly maintenanceWindows = this._maintenanceWindows.asReadonly();
  readonly activeDataSourceMode = this._activeDataSourceMode.asReadonly();

  readonly ordersByCenter = computed(() => {
    const grouped = new Map<string, WorkOrder[]>();

    for (const center of this._workCenters()) {
      grouped.set(center.id, []);
    }

    for (const order of this._workOrders()) {
      const bucket = grouped.get(order.workCenterId) ?? [];
      bucket.push(order);
      grouped.set(order.workCenterId, bucket);
    }

    for (const [centerId, orders] of grouped) {
      grouped.set(
        centerId,
        [...orders].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      );
    }

    return grouped;
  });

  constructor() {
    void this.initializeDataSource();
  }

  loadFromApi(dataset: ApiScheduleDataset): void {
    const mapped = mapApiToDomain(dataset);
    this._workCenters.set(mapped.workCenters);
    this._manufacturingOrders.set(mapped.manufacturingOrders);
    this._routings.set(mapped.routings);
    this._workOrders.set(mapped.workOrders);
    this._shiftWindows.set(mapped.shiftWindows);
    this._maintenanceWindows.set(mapped.maintenanceWindows);
  }

  replaceWorkOrders(workOrders: WorkOrder[]): void {
    this._workOrders.set(workOrders);
  }

  deleteWorkOrder(workOrderId: string): void {
    this._workOrders.set(this._workOrders().filter((order) => order.docId !== workOrderId));
  }

  resetToDefaultDataset(): void {
    this.loadFromApi(buildDefaultTimelineDataset());
    this._activeDataSourceMode.set('local');
  }

  async loadFromUrl(url: string): Promise<void> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Could not load dataset from "${url}"`);
    }

    const parsed = (await response.json()) as unknown;
    const dataset = this.extractScheduleDataset(parsed);
    this.loadFromApi(dataset);
  }

  async loadFromPagedUrl(url: string, pageSize = 500): Promise<void> {
    const safePageSize = Math.max(1, Math.trunc(pageSize));
    let page = 1;
    let totalPages = Number.POSITIVE_INFINITY;

    const dataset: ApiScheduleDataset = {
      workCenters: [],
      manufacturingOrders: [],
      routings: [],
      workOrders: []
    };

    while (page <= totalPages) {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set('page', String(page));
      pageUrl.searchParams.set('pageSize', String(safePageSize));
      pageUrl.searchParams.set('includeStatic', page === 1 ? 'true' : 'false');

      const response = await fetch(pageUrl.toString(), { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Could not load paged dataset from "${pageUrl.toString()}"`);
      }

      const parsed = (await response.json()) as unknown;
      const paged = this.extractPagedScheduleDatasetResponse(parsed);
      totalPages = Math.max(1, paged.totalPages);

      if (page === 1) {
        dataset.workCenters = paged.scheduleDataset.workCenters;
        dataset.manufacturingOrders = paged.scheduleDataset.manufacturingOrders;
        dataset.routings = paged.scheduleDataset.routings;
      }

      dataset.workOrders.push(...paged.scheduleDataset.workOrders);

      if (!paged.hasNextPage) {
        break;
      }
      page += 1;
    }

    this.loadFromApi(dataset);
  }

  private async initializeDataSource(): Promise<void> {
    const mode = this.dataSourceConfig.mode;
    this.logDataSource(`Initializing datasource mode "${mode}"`);

    try {
      if (mode === 'local') {
        this.loadFromApi(buildDefaultTimelineDataset());
        this._activeDataSourceMode.set('local');
        return;
      }

      if (mode === 'api') {
        if (!this.dataSourceConfig.apiUrl.trim()) {
          throw new Error('apiUrl is empty for mode "api".');
        }
        await this.loadFromUrl(this.dataSourceConfig.apiUrl);
        this._activeDataSourceMode.set('api');
        return;
      }

      if (mode === 'api-paged') {
        if (!this.dataSourceConfig.apiUrl.trim()) {
          throw new Error('apiUrl is empty for mode "api-paged".');
        }
        await this.loadFromPagedUrl(this.dataSourceConfig.apiUrl, this.dataSourceConfig.apiPageSize);
        this._activeDataSourceMode.set('api-paged');
      }
    } catch (error) {
      if (this.dataSourceConfig.fallbackToLocalOnError) {
        this.logDataSource(
          `Datasource mode "${mode}" failed. Falling back to "local".`,
          error
        );
        this.loadFromApi(buildDefaultTimelineDataset());
        this._activeDataSourceMode.set('local');
        return;
      }
      throw error;
    }
  }

  private logDataSource(message: string, error?: unknown): void {
    if (!this.dataSourceConfig.logSelection) {
      return;
    }
    if (error) {
      console.warn(`[ScheduleService] ${message}`, error);
      return;
    }
    console.info(`[ScheduleService] ${message}`);
  }

  private extractScheduleDataset(payload: unknown): ApiScheduleDataset {
    if (this.isApiScheduleDataset(payload)) {
      return payload;
    }

    if (typeof payload === 'object' && payload !== null) {
      const wrapped = (payload as { scheduleDataset?: unknown }).scheduleDataset;
      if (this.isApiScheduleDataset(wrapped)) {
        return wrapped;
      }
    }

    throw new Error(
      'Invalid dataset format. Expected ApiScheduleDataset or { scheduleDataset: ApiScheduleDataset }.'
    );
  }

  private isApiScheduleDataset(payload: unknown): payload is ApiScheduleDataset {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    const candidate = payload as Partial<ApiScheduleDataset>;
    return (
      Array.isArray(candidate.workCenters) &&
      Array.isArray(candidate.manufacturingOrders) &&
      Array.isArray(candidate.routings) &&
      Array.isArray(candidate.workOrders)
    );
  }

  private extractPagedScheduleDatasetResponse(payload: unknown): ApiPagedScheduleDatasetResponse {
    if (!this.isPagedScheduleDatasetResponse(payload)) {
      throw new Error(
        'Invalid paged dataset format. Expected ApiPagedScheduleDatasetResponse.'
      );
    }
    return payload;
  }

  private isPagedScheduleDatasetResponse(payload: unknown): payload is ApiPagedScheduleDatasetResponse {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    const candidate = payload as Partial<ApiPagedScheduleDatasetResponse>;
    return (
      typeof candidate.page === 'number' &&
      typeof candidate.pageSize === 'number' &&
      typeof candidate.totalWorkOrders === 'number' &&
      typeof candidate.totalPages === 'number' &&
      typeof candidate.hasNextPage === 'boolean' &&
      this.isApiScheduleDataset(candidate.scheduleDataset)
    );
  }

  loadSyntheticDataset(orderCount = 1000): void {
    const workCenterIds = this._workCenters().map((center) => center.id);
    const sourceCenters = this._workCenters();
    const synthetic = generateSyntheticReflowInput({
      orderCount,
      workCenterIds: workCenterIds.length > 0 ? workCenterIds : ['WC-1', 'WC-2', 'WC-3'],
      startDate: new Date()
    });

    const moIds = [...new Set(synthetic.workOrders.map((order) => order.manufacturingOrderId))];
    const manufacturingOrders: ManufacturingOrder[] = moIds.map((id, index) => ({
      id,
      manufacturingOrderNumber: id.replace('MO-B-', '9'),
      itemId: `ITEM-${index + 1}`,
      quantity: 100 + index * 10,
      dueDate: new Date(Date.now() + (index + 30) * 24 * 60 * 60 * 1000).toISOString()
    }));

    this._workCenters.set(sourceCenters);
    this._manufacturingOrders.set(manufacturingOrders);
    this._routings.set(synthetic.routings ?? []);
    this._workOrders.set(synthetic.workOrders);
    this._shiftWindows.set(synthetic.shifts);
    this._maintenanceWindows.set(synthetic.maintenanceWindows);
  }
}

function buildDefaultTimelineDataset(): ApiScheduleDataset {
  return {
    workCenters: [
      {
        docId: 'WC-CUT-02',
        docType: 'workCenter',
        data: {
          name: 'Genesis Hardware',
          shifts: buildWeekdayShift(),
          maintenanceWindows: []
        }
      },
      {
        docId: 'WC-WELD-01',
        docType: 'workCenter',
        data: {
          name: 'Rodriques Electrics',
          shifts: buildWeekdayShift(),
          maintenanceWindows: []
        }
      },
      {
        docId: 'WC-PAINT-01',
        docType: 'workCenter',
        data: {
          name: 'Konsulting Inc',
          shifts: buildWeekdayShift(),
          maintenanceWindows: []
        }
      },
      {
        docId: 'WC-PACK-01',
        docType: 'workCenter',
        data: {
          name: 'McMarrow Distribution',
          shifts: buildWeekdayShift(),
          maintenanceWindows: []
        }
      },
      {
        docId: 'WC-EXT-01',
        docType: 'workCenter',
        data: {
          name: 'Spartan Manufacturing',
          shifts: buildWeekdayShift(),
          maintenanceWindows: []
        }
      }
    ],
    manufacturingOrders: [
      {
        docId: 'MO-106',
        docType: 'manufacturingOrder',
        data: {
          manufacturingOrderNumber: '5000123',
          itemId: 'PIPE-8MM',
          quantity: 100,
          dueDate: '2026-03-15T00:00:00.000Z'
        }
      }
    ],
    routings: [
      {
        docId: 'RT-106',
        docType: 'routing',
        data: {
          routingNumber: 'R-5000123',
          manufacturingOrderId: 'MO-106',
          operations: [
            { sequence: 10, operationNumber: 10, operationName: 'Cut', workCenterId: 'WC-CUT-02' },
            { sequence: 20, operationNumber: 20, operationName: 'Weld', workCenterId: 'WC-WELD-01' },
            { sequence: 30, operationNumber: 30, operationName: 'Paint', workCenterId: 'WC-PAINT-01' },
            { sequence: 40, operationNumber: 40, operationName: 'Pack', workCenterId: 'WC-PACK-01' }
          ]
        }
      }
    ],
    workOrders: [
      {
        docId: 'WO-020',
        docType: 'workOrder',
        data: {
          workOrderNumber: 'Concentrix Ltd',
          manufacturingOrderId: 'MO-106',
          operationNumber: 10,
          operationName: 'Concentrix Ltd',
          workCenterId: 'WC-CUT-02',
          status: 'complete',
          startDate: '2025-08-01T00:00:00.000Z',
          endDate: '2025-10-02T00:00:00.000Z',
          durationMinutes: 26400,
          isMaintenance: false,
          dependsOnWorkOrderIds: []
        }
      },
      {
        docId: 'WO-021',
        docType: 'workOrder',
        data: {
          workOrderNumber: 'Rodriques Electrics',
          manufacturingOrderId: 'MO-106',
          operationNumber: 20,
          operationName: 'Rodriques Electrics',
          workCenterId: 'WC-WELD-01',
          status: 'in-progress',
          startDate: '2025-08-15T00:00:00.000Z',
          endDate: '2025-11-05T00:00:00.000Z',
          durationMinutes: 35640,
          isMaintenance: false,
          dependsOnWorkOrderIds: []
        }
      },
      {
        docId: 'WO-022',
        docType: 'workOrder',
        data: {
          workOrderNumber: 'Konsulting Inc',
          manufacturingOrderId: 'MO-106',
          operationNumber: 30,
          operationName: 'Konsulting Inc',
          workCenterId: 'WC-PAINT-01',
          status: 'in-progress',
          startDate: '2025-09-01T00:00:00.000Z',
          endDate: '2025-11-30T00:00:00.000Z',
          durationMinutes: 39240,
          isMaintenance: false,
          dependsOnWorkOrderIds: []
        }
      },
      {
        docId: 'WO-023',
        docType: 'workOrder',
        data: {
          workOrderNumber: 'Compleks Systems',
          manufacturingOrderId: 'MO-106',
          operationNumber: 30,
          operationName: 'Compleks Systems',
          workCenterId: 'WC-PAINT-01',
          status: 'in-progress',
          startDate: '2025-11-10T00:00:00.000Z',
          endDate: '2026-02-15T00:00:00.000Z',
          durationMinutes: 41760,
          isMaintenance: false,
          dependsOnWorkOrderIds: []
        }
      },
      {
        docId: 'WO-024',
        docType: 'workOrder',
        data: {
          workOrderNumber: 'McMarrow Distribution',
          manufacturingOrderId: 'MO-106',
          operationNumber: 40,
          operationName: 'McMarrow Distribution',
          workCenterId: 'WC-PACK-01',
          status: 'blocked',
          startDate: '2025-10-01T00:00:00.000Z',
          endDate: '2026-01-10T00:00:00.000Z',
          durationMinutes: 43200,
          isMaintenance: false,
          dependsOnWorkOrderIds: []
        }
      },
      {
        docId: 'WO-025',
        docType: 'workOrder',
        data: {
          workOrderNumber: 'Apex Materials',
          manufacturingOrderId: 'MO-106',
          operationNumber: 50,
          operationName: 'Apex Materials',
          workCenterId: 'WC-EXT-01',
          status: 'open',
          startDate: '2026-02-20T00:00:00.000Z',
          endDate: '2026-04-02T00:00:00.000Z',
          durationMinutes: 59040,
          isMaintenance: false,
          dependsOnWorkOrderIds: []
        }
      },
      {
        docId: 'WO-026',
        docType: 'workOrder',
        data: {
          workOrderNumber: 'Urban Forge',
          manufacturingOrderId: 'MO-106',
          operationNumber: 60,
          operationName: 'Urban Forge',
          workCenterId: 'WC-WELD-01',
          status: 'complete',
          startDate: '2025-12-01T00:00:00.000Z',
          endDate: '2026-01-15T00:00:00.000Z',
          durationMinutes: 64800,
          isMaintenance: false,
          dependsOnWorkOrderIds: []
        }
      },
      {
        docId: 'WO-027',
        docType: 'workOrder',
        data: {
          workOrderNumber: 'Norex Plastics',
          manufacturingOrderId: 'MO-106',
          operationNumber: 70,
          operationName: 'Norex Plastics',
          workCenterId: 'WC-CUT-02',
          status: 'blocked',
          startDate: '2026-03-01T00:00:00.000Z',
          endDate: '2026-04-18T00:00:00.000Z',
          durationMinutes: 69120,
          isMaintenance: false,
          dependsOnWorkOrderIds: []
        }
      }
    ]
  };
}

function buildWeekdayShift(): Array<{ dayOfWeek: number; startHour: number; endHour: number }> {
  return [
    { dayOfWeek: 1, startHour: 8, endHour: 17 },
    { dayOfWeek: 2, startHour: 8, endHour: 17 },
    { dayOfWeek: 3, startHour: 8, endHour: 17 },
    { dayOfWeek: 4, startHour: 8, endHour: 17 },
    { dayOfWeek: 5, startHour: 8, endHour: 17 }
  ];
}
