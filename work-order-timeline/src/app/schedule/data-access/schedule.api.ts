export interface ApiWorkCenterDocument {
  docId: string;
  docType: 'workCenter';
  data: {
    name: string;
    shifts: Array<{
      dayOfWeek: number;
      startHour: number;
      endHour: number;
    }>;
    maintenanceWindows: Array<{
      startDate: string;
      endDate: string;
      reason: string;
    }>;
  };
}

export interface ApiManufacturingOrderDocument {
  docId: string;
  docType: 'manufacturingOrder';
  data: {
    manufacturingOrderNumber: string;
    itemId: string;
    quantity: number;
    dueDate: string;
  };
}

export interface ApiRoutingDocument {
  docId: string;
  docType: 'routing';
  data: {
    routingNumber: string;
    manufacturingOrderId: string;
    operations: Array<{
      sequence: number;
      operationNumber: number;
      operationName: string;
      workCenterId: string;
    }>;
  };
}

export interface ApiWorkOrderDocument {
  docId: string;
  docType: 'workOrder';
  data: {
    workOrderNumber: string;
    manufacturingOrderId: string;
    operationNumber: number;
    operationName: string;
    workCenterId: string;
    status: 'open' | 'in-progress' | 'complete' | 'blocked';
    startDate: string;
    endDate: string;
    durationMinutes: number;
    setupTimeMinutes?: number;
    isMaintenance: boolean;
    dependsOnWorkOrderIds: string[];
  };
}

export interface ApiScheduleDataset {
  workCenters: ApiWorkCenterDocument[];
  manufacturingOrders: ApiManufacturingOrderDocument[];
  routings: ApiRoutingDocument[];
  workOrders: ApiWorkOrderDocument[];
}

export interface ApiPagedScheduleDatasetResponse {
  page: number;
  pageSize: number;
  totalWorkOrders: number;
  totalPages: number;
  hasNextPage: boolean;
  scheduleDataset: ApiScheduleDataset;
}
