export type WorkOrderStatus = 'open' | 'in-progress' | 'complete' | 'blocked';

export interface ManufacturingOrder {
  id: string;
  manufacturingOrderNumber: string;
  itemId: string;
  quantity: number;
  dueDate: string;
}

export interface RoutingOperation {
  sequence: number;
  operationNumber: number;
  operationName: string;
  workCenterId: string;
}

export interface Routing {
  id: string;
  routingNumber: string;
  manufacturingOrderId: string;
  operations: RoutingOperation[];
}

export interface ShiftDefinition {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

export interface WorkCenter {
  id: string;
  name: string;
  shifts: ShiftDefinition[];
  maintenanceWindows: MaintenanceWindow[];
}

export interface ShiftWindow {
  workCenterId: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

export interface MaintenanceWindow {
  id: string;
  workCenterId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface WorkOrder {
  docId: string;
  docType: 'workOrder';
  workOrderNumber: string;
  manufacturingOrderId: string;
  operationNumber: number;
  operationName: string;
  workCenterId: string;
  status: WorkOrderStatus;
  startDate: string;
  endDate: string;
  durationMinutes: number;
  setupTimeMinutes?: number;
  isMaintenance: boolean;
  dependsOnWorkOrderIds: string[];
}

export type ScheduleIssueCode =
  | 'OVERLAP'
  | 'DEPENDENCY_BLOCKED'
  | 'DEPENDENCY_MISSING'
  | 'SHIFT_VIOLATION'
  | 'MAINTENANCE_VIOLATION'
  | 'INVALID_DURATION'
  | 'CYCLE_DETECTED'
  | 'UNSCHEDULABLE';

export interface ScheduleIssue {
  code: ScheduleIssueCode;
  severity: 'error' | 'warning';
  message: string;
  workOrderId?: string;
}

export interface ScheduleValidationReport {
  ok: boolean;
  issues: ScheduleIssue[];
}

export interface ReflowInput {
  workOrders: WorkOrder[];
  routings?: Routing[];
  shifts: ShiftWindow[];
  maintenanceWindows: MaintenanceWindow[];
}

export interface ReflowChange {
  workOrderId: string;
  workOrderNumber: string;
  workCenterId: string;
  originalStartDate: string;
  originalEndDate: string;
  newStartDate: string;
  newEndDate: string;
  delayMinutes: number;
}

export interface ReflowMetrics {
  totalOrders: number;
  movedOrders: number;
  totalDelayMinutes: number;
  averageDelayMinutes: number;
  maxDelayMinutes: number;
  runtimeMs: number;
}

export interface ReflowResult {
  workOrders: WorkOrder[];
  issues: ScheduleIssue[];
  changes: ReflowChange[];
  metrics: ReflowMetrics;
}
