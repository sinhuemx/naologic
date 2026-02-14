import {
  MaintenanceWindow,
  Routing,
  ReflowChange,
  ReflowInput,
  ReflowMetrics,
  ReflowResult,
  ScheduleIssue,
  ScheduleValidationReport,
  ShiftWindow,
  WorkOrder
} from './schedule.models';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

interface WorkRange {
  startMs: number;
  endMs: number;
}

interface BenchmarkOptions {
  orderCount: number;
  workCenterIds: string[];
  startDate: Date;
}

export function validateSchedule(input: ReflowInput): ScheduleValidationReport {
  const issues: ScheduleIssue[] = [];
  const byCenter = groupByWorkCenter(input.workOrders);
  const dependencyMap = buildEffectiveDependencies(input.workOrders, input.routings ?? []);

  for (const [workCenterId, orders] of byCenter) {
    const sorted = [...orders].sort((a, b) => toMs(a.startDate) - toMs(b.startDate));
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = sorted[index - 1];
      const curr = sorted[index];
      if (toMs(prev.endDate) > toMs(curr.startDate)) {
        issues.push({
          code: 'OVERLAP',
          severity: 'error',
          workOrderId: curr.docId,
          message: `Work center ${workCenterId} has overlap between ${prev.workOrderNumber} and ${curr.workOrderNumber}.`
        });
      }
    }
  }

  const byId = new Map(input.workOrders.map((order) => [order.docId, order]));
  for (const order of input.workOrders) {
    if (order.durationMinutes <= 0) {
      issues.push({
        code: 'INVALID_DURATION',
        severity: 'error',
        workOrderId: order.docId,
        message: `Work order ${order.workOrderNumber} has invalid duration.`
      });
    }

    for (const dependencyId of dependencyMap.get(order.docId) ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        issues.push({
          code: 'DEPENDENCY_MISSING',
          severity: 'error',
          workOrderId: order.docId,
          message: `Work order ${order.workOrderNumber} depends on missing order ${dependencyId}.`
        });
        continue;
      }

      if (toMs(dependency.endDate) > toMs(order.startDate)) {
        issues.push({
          code: 'DEPENDENCY_BLOCKED',
          severity: 'error',
          workOrderId: order.docId,
          message: `Work order ${order.workOrderNumber} starts before dependency ${dependency.workOrderNumber} ends.`
        });
      }
    }
  }

  const cycleIssue = detectCycleIssue(input.workOrders);
  if (cycleIssue) {
    issues.push(cycleIssue);
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function buildReflowSchedule(input: ReflowInput): ReflowResult {
  const startedAt = performanceNow();
  const issues: ScheduleIssue[] = [];

  const dependencyMap = buildEffectiveDependencies(input.workOrders, input.routings ?? []);
  const { ordered, cycleIssue } = topologicalSort(input.workOrders, dependencyMap);
  if (cycleIssue) {
    issues.push(cycleIssue);
    return {
      workOrders: [...input.workOrders],
      issues,
      changes: [],
      metrics: createMetrics(input.workOrders.length, [], startedAt)
    };
  }

  const shiftsByCenter = buildShiftLookup(input.shifts);
  const maintenanceByCenter = buildMaintenanceLookup(input.maintenanceWindows);
  const originalById = new Map(input.workOrders.map((order) => [order.docId, order]));
  const scheduledById = new Map<string, WorkOrder>();
  const workCenterCursor = new Map<string, number>();

  for (const order of ordered) {
    if (order.durationMinutes <= 0) {
      issues.push({
        code: 'INVALID_DURATION',
        severity: 'error',
        workOrderId: order.docId,
        message: `Work order ${order.workOrderNumber} has invalid duration and cannot be scheduled.`
      });
      continue;
    }

    const parentDependencies = dependencyMap.get(order.docId) ?? [];
    const parentEndMs = Math.max(
      ...parentDependencies
        .map((dependencyId) => scheduledById.get(dependencyId))
        .filter((dependency): dependency is WorkOrder => !!dependency)
        .map((dependency) => toMs(dependency.endDate)),
      Number.NEGATIVE_INFINITY
    );

    for (const dependencyId of parentDependencies) {
      if (!originalById.has(dependencyId)) {
        issues.push({
          code: 'DEPENDENCY_MISSING',
          severity: 'error',
          workOrderId: order.docId,
          message: `Work order ${order.workOrderNumber} depends on missing order ${dependencyId}.`
        });
      }
    }

    const requestedStartMs = Math.max(
      toMs(order.startDate),
      Number.isFinite(parentEndMs) ? parentEndMs : toMs(order.startDate),
      workCenterCursor.get(order.workCenterId) ?? Number.NEGATIVE_INFINITY
    );

    const range = scheduleInCalendar(
      order.workCenterId,
      requestedStartMs,
      order.durationMinutes,
      shiftsByCenter,
      maintenanceByCenter
    );

    if (!range) {
      issues.push({
        code: 'UNSCHEDULABLE',
        severity: 'error',
        workOrderId: order.docId,
        message: `Work order ${order.workOrderNumber} cannot be scheduled with current constraints.`
      });
      continue;
    }

    const next: WorkOrder = {
      ...order,
      startDate: new Date(range.startMs).toISOString(),
      endDate: new Date(range.endMs).toISOString(),
      durationMinutes: Math.max(1, Math.round((range.endMs - range.startMs) / MINUTE_MS))
    };

    scheduledById.set(next.docId, next);
    workCenterCursor.set(next.workCenterId, range.endMs);
  }

  const fallbackUnscheduled = input.workOrders.filter((order) => !scheduledById.has(order.docId));
  for (const order of fallbackUnscheduled) {
    scheduledById.set(order.docId, { ...order });
  }

  const workOrders = input.workOrders.map((order) => scheduledById.get(order.docId) ?? order);
  const changes = buildChanges(input.workOrders, workOrders);
  const metrics = createMetrics(input.workOrders.length, changes, startedAt);

  return {
    workOrders,
    issues,
    changes,
    metrics
  };
}

export function generateSyntheticReflowInput(options: BenchmarkOptions): ReflowInput {
  const shifts = options.workCenterIds.flatMap((workCenterId) =>
    [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      workCenterId,
      dayOfWeek,
      startHour: 8,
      endHour: 17
    }))
  );

  const maintenanceWindows: MaintenanceWindow[] = [];
  const routings: Routing[] = [];
  const workOrders: WorkOrder[] = [];

  for (let index = 0; index < options.orderCount; index += 1) {
    const centerId = options.workCenterIds[index % options.workCenterIds.length];
    const chainOffsetDays = Math.floor(index / options.workCenterIds.length);
    const start = new Date(options.startDate.getTime() + chainOffsetDays * DAY_MS);
    start.setHours(8 + (index % 3), 0, 0, 0);
    const durationMinutes = 60 + ((index % 5) + 1) * 30;

    workOrders.push({
      docId: `WO-B-${index + 1}`,
      docType: 'workOrder',
      workOrderNumber: `WO-B-${String(index + 1).padStart(5, '0')}`,
      manufacturingOrderId: `MO-B-${Math.floor(index / 25) + 1}`,
      operationNumber: 10 + (index % 80),
      operationName: `Synthetic Op ${index + 1}`,
      workCenterId: centerId,
      status: index % 4 === 0 ? 'open' : index % 4 === 1 ? 'in-progress' : index % 4 === 2 ? 'complete' : 'blocked',
      startDate: start.toISOString(),
      endDate: new Date(start.getTime() + durationMinutes * MINUTE_MS).toISOString(),
      durationMinutes,
      isMaintenance: false,
      dependsOnWorkOrderIds: index > 0 ? [`WO-B-${index}`] : []
    });
  }

  const byMo = new Map<string, WorkOrder[]>();
  for (const order of workOrders) {
    const bucket = byMo.get(order.manufacturingOrderId) ?? [];
    bucket.push(order);
    byMo.set(order.manufacturingOrderId, bucket);
  }

  for (const [moId, orders] of byMo) {
    const operations = [...orders]
      .sort((a, b) => a.operationNumber - b.operationNumber)
      .map((order, idx) => ({
        sequence: (idx + 1) * 10,
        operationNumber: order.operationNumber,
        operationName: order.operationName,
        workCenterId: order.workCenterId
      }));

    routings.push({
      id: `RT-${moId}`,
      routingNumber: `R-${moId}`,
      manufacturingOrderId: moId,
      operations
    });
  }

  return {
    workOrders,
    routings,
    shifts,
    maintenanceWindows
  };
}

function groupByWorkCenter(workOrders: WorkOrder[]): Map<string, WorkOrder[]> {
  const byCenter = new Map<string, WorkOrder[]>();
  for (const order of workOrders) {
    const bucket = byCenter.get(order.workCenterId) ?? [];
    bucket.push(order);
    byCenter.set(order.workCenterId, bucket);
  }
  return byCenter;
}

function topologicalSort(
  workOrders: WorkOrder[],
  dependencyMap: Map<string, string[]>
): { ordered: WorkOrder[]; cycleIssue?: ScheduleIssue } {
  const byId = new Map(workOrders.map((order) => [order.docId, order]));
  const indegree = new Map(workOrders.map((order) => [order.docId, 0]));
  const children = new Map<string, string[]>();

  for (const order of workOrders) {
    for (const parentId of dependencyMap.get(order.docId) ?? []) {
      if (!byId.has(parentId)) {
        continue;
      }
      indegree.set(order.docId, (indegree.get(order.docId) ?? 0) + 1);
      const bucket = children.get(parentId) ?? [];
      bucket.push(order.docId);
      children.set(parentId, bucket);
    }
  }

  const queue = workOrders
    .filter((order) => (indegree.get(order.docId) ?? 0) === 0)
    .sort((a, b) => toMs(a.startDate) - toMs(b.startDate))
    .map((order) => order.docId);

  const ordered: WorkOrder[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const order = byId.get(id);
    if (!order) {
      continue;
    }
    ordered.push(order);

    for (const childId of children.get(id) ?? []) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) {
        queue.push(childId);
      }
    }
  }

  if (ordered.length !== workOrders.length) {
    return {
      ordered: workOrders,
      cycleIssue: {
        code: 'CYCLE_DETECTED',
        severity: 'error',
        message: 'Circular dependency detected in work orders.'
      }
    };
  }

  return { ordered };
}

function detectCycleIssue(workOrders: WorkOrder[]): ScheduleIssue | undefined {
  const dependencyMap = buildEffectiveDependencies(workOrders, []);
  const { cycleIssue } = topologicalSort(workOrders, dependencyMap);
  return cycleIssue;
}

function buildEffectiveDependencies(workOrders: WorkOrder[], routings: Routing[]): Map<string, string[]> {
  const byId = new Map(workOrders.map((order) => [order.docId, order]));
  const byMo = new Map<string, WorkOrder[]>();
  const dependencyMap = new Map<string, Set<string>>();

  for (const order of workOrders) {
    dependencyMap.set(order.docId, new Set(order.dependsOnWorkOrderIds));
    const bucket = byMo.get(order.manufacturingOrderId) ?? [];
    bucket.push(order);
    byMo.set(order.manufacturingOrderId, bucket);
  }

  for (const routing of routings) {
    const moOrders = byMo.get(routing.manufacturingOrderId) ?? [];
    if (moOrders.length === 0) {
      continue;
    }

    const operations = [...routing.operations].sort((a, b) => a.sequence - b.sequence);
    for (let index = 1; index < operations.length; index += 1) {
      const prev = operations[index - 1];
      const curr = operations[index];

      const parentOrder = moOrders.find((order) => order.operationNumber === prev.operationNumber);
      const childOrder = moOrders.find((order) => order.operationNumber === curr.operationNumber);

      if (!parentOrder || !childOrder || !byId.has(childOrder.docId)) {
        continue;
      }

      dependencyMap.get(childOrder.docId)?.add(parentOrder.docId);
    }
  }

  return new Map([...dependencyMap.entries()].map(([id, deps]) => [id, [...deps]]));
}

function buildShiftLookup(shifts: ShiftWindow[]): Map<string, ShiftWindow[]> {
  const byCenter = new Map<string, ShiftWindow[]>();
  for (const shift of shifts) {
    const bucket = byCenter.get(shift.workCenterId) ?? [];
    bucket.push(shift);
    byCenter.set(shift.workCenterId, bucket);
  }
  return byCenter;
}

function buildMaintenanceLookup(maintenance: MaintenanceWindow[]): Map<string, Array<{ startMs: number; endMs: number }>> {
  const byCenter = new Map<string, Array<{ startMs: number; endMs: number }>>();
  for (const window of maintenance) {
    const bucket = byCenter.get(window.workCenterId) ?? [];
    bucket.push({ startMs: toMs(window.startDate), endMs: toMs(window.endDate) });
    byCenter.set(window.workCenterId, bucket);
  }

  for (const [workCenterId, windows] of byCenter) {
    byCenter.set(workCenterId, [...windows].sort((a, b) => a.startMs - b.startMs));
  }
  return byCenter;
}

function scheduleInCalendar(
  workCenterId: string,
  requestedStartMs: number,
  durationMinutes: number,
  shiftsByCenter: Map<string, ShiftWindow[]>,
  maintenanceByCenter: Map<string, Array<{ startMs: number; endMs: number }>>
): WorkRange | null {
  let pointer = Number.isFinite(requestedStartMs) ? requestedStartMs : Date.now();
  let remainingMinutes = durationMinutes;
  let actualStartMs: number | null = null;
  let guard = 0;

  while (remainingMinutes > 0 && guard < 40000) {
    guard += 1;
    const shiftRange = nextShiftRange(pointer, shiftsByCenter.get(workCenterId) ?? []);
    if (!shiftRange) {
      return null;
    }

    const blocked = nextMaintenanceOverlap(shiftRange.startMs, shiftRange.endMs, maintenanceByCenter.get(workCenterId) ?? []);
    if (blocked && blocked.startMs <= shiftRange.startMs) {
      pointer = blocked.endMs;
      continue;
    }

    const effectiveRangeEnd = blocked ? Math.min(shiftRange.endMs, blocked.startMs) : shiftRange.endMs;
    if (effectiveRangeEnd <= shiftRange.startMs) {
      pointer = shiftRange.endMs;
      continue;
    }

    if (actualStartMs === null) {
      actualStartMs = shiftRange.startMs;
    }

    const rangeMinutes = Math.floor((effectiveRangeEnd - shiftRange.startMs) / MINUTE_MS);
    const consumed = Math.min(remainingMinutes, rangeMinutes);
    remainingMinutes -= consumed;
    pointer = shiftRange.startMs + consumed * MINUTE_MS;

    if (remainingMinutes > 0) {
      pointer = Math.max(pointer, blocked ? blocked.endMs : shiftRange.endMs);
    }
  }

  if (remainingMinutes > 0 || actualStartMs === null) {
    return null;
  }

  return { startMs: actualStartMs, endMs: pointer };
}

function nextShiftRange(pointerMs: number, shifts: ShiftWindow[]): WorkRange | null {
  if (shifts.length === 0) {
    return {
      startMs: pointerMs,
      endMs: pointerMs + DAY_MS
    };
  }

  let candidate = pointerMs;
  for (let dayOffset = 0; dayOffset < 370; dayOffset += 1) {
    const day = new Date(candidate);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + dayOffset);

    const jsDay = day.getDay();
    const mappedDay = jsDay === 0 ? 7 : jsDay;
    const dayShifts = shifts.filter((shift) => shift.dayOfWeek === mappedDay).sort((a, b) => a.startHour - b.startHour);

    for (const shift of dayShifts) {
      const start = new Date(day);
      start.setHours(shift.startHour, 0, 0, 0);
      const end = new Date(day);
      end.setHours(shift.endHour, 0, 0, 0);
      if (end.getTime() <= pointerMs) {
        continue;
      }
      return {
        startMs: Math.max(start.getTime(), pointerMs),
        endMs: end.getTime()
      };
    }
  }

  return null;
}

function nextMaintenanceOverlap(
  rangeStartMs: number,
  rangeEndMs: number,
  maintenanceWindows: Array<{ startMs: number; endMs: number }>
): { startMs: number; endMs: number } | null {
  for (const window of maintenanceWindows) {
    if (window.endMs <= rangeStartMs) {
      continue;
    }
    if (window.startMs >= rangeEndMs) {
      return null;
    }
    if (window.startMs < rangeEndMs && window.endMs > rangeStartMs) {
      return window;
    }
  }
  return null;
}

function buildChanges(original: WorkOrder[], next: WorkOrder[]): ReflowChange[] {
  const byOriginal = new Map(original.map((order) => [order.docId, order]));
  const changes: ReflowChange[] = [];

  for (const order of next) {
    const previous = byOriginal.get(order.docId);
    if (!previous) {
      continue;
    }
    const delayMinutes = Math.max(0, Math.round((toMs(order.endDate) - toMs(previous.endDate)) / MINUTE_MS));
    if (delayMinutes === 0 && previous.startDate === order.startDate && previous.endDate === order.endDate) {
      continue;
    }

    changes.push({
      workOrderId: order.docId,
      workOrderNumber: order.workOrderNumber,
      workCenterId: order.workCenterId,
      originalStartDate: previous.startDate,
      originalEndDate: previous.endDate,
      newStartDate: order.startDate,
      newEndDate: order.endDate,
      delayMinutes
    });
  }

  return changes.sort((a, b) => b.delayMinutes - a.delayMinutes);
}

function createMetrics(totalOrders: number, changes: ReflowChange[], startedAtMs: number): ReflowMetrics {
  const delays = changes.map((change) => change.delayMinutes);
  const totalDelayMinutes = delays.reduce((sum, current) => sum + current, 0);
  const movedOrders = changes.length;

  return {
    totalOrders,
    movedOrders,
    totalDelayMinutes,
    averageDelayMinutes: movedOrders === 0 ? 0 : Math.round(totalDelayMinutes / movedOrders),
    maxDelayMinutes: delays.length === 0 ? 0 : Math.max(...delays),
    runtimeMs: Math.max(0, Math.round((performanceNow() - startedAtMs) * 100) / 100)
  };
}

function performanceNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function toMs(dateIso: string): number {
  return new Date(dateIso).getTime();
}
