import { buildReflowSchedule, generateSyntheticReflowInput, validateSchedule } from './schedule-engine';
import { ReflowInput, WorkOrder } from './schedule.models';

describe('schedule-engine', () => {
  it('detects overlap in same work center', () => {
    const input = createSimpleInput([
      createOrder('WO-1', 'WC-1', '2026-02-10T08:00:00.000Z', '2026-02-10T10:00:00.000Z'),
      createOrder('WO-2', 'WC-1', '2026-02-10T09:00:00.000Z', '2026-02-10T11:00:00.000Z')
    ]);

    const report = validateSchedule(input);
    expect(report.ok).toBeFalse();
    expect(report.issues.some((issue) => issue.code === 'OVERLAP')).toBeTrue();
  });

  it('reflows dependent orders without overlap', () => {
    const parent = createOrder('WO-1', 'WC-1', '2026-02-10T08:00:00.000Z', '2026-02-10T12:00:00.000Z', 240);
    const child = {
      ...createOrder('WO-2', 'WC-1', '2026-02-10T09:00:00.000Z', '2026-02-10T11:00:00.000Z', 120),
      dependsOnWorkOrderIds: ['WO-1']
    };

    const input = createSimpleInput([parent, child]);
    const result = buildReflowSchedule(input);
    const report = validateSchedule({ ...input, workOrders: result.workOrders });

    expect(report.ok).toBeTrue();
    const reflowedChild = result.workOrders.find((order) => order.docId === 'WO-2');
    expect(reflowedChild).toBeDefined();
    expect(new Date(reflowedChild!.startDate).getTime()).toBeGreaterThanOrEqual(new Date(parent.endDate).getTime());
    expect(result.metrics.movedOrders).toBeGreaterThan(0);
  });

  it('detects cycle dependencies', () => {
    const a = { ...createOrder('WO-1', 'WC-1', '2026-02-10T08:00:00.000Z', '2026-02-10T09:00:00.000Z', 60), dependsOnWorkOrderIds: ['WO-2'] };
    const b = { ...createOrder('WO-2', 'WC-1', '2026-02-10T09:00:00.000Z', '2026-02-10T10:00:00.000Z', 60), dependsOnWorkOrderIds: ['WO-1'] };
    const input = createSimpleInput([a, b]);

    const result = buildReflowSchedule(input);
    expect(result.issues.some((issue) => issue.code === 'CYCLE_DETECTED')).toBeTrue();
  });

  it('handles large synthetic data', () => {
    const input = generateSyntheticReflowInput({
      orderCount: 1500,
      workCenterIds: ['WC-1', 'WC-2', 'WC-3', 'WC-4', 'WC-5'],
      startDate: new Date('2026-01-01T08:00:00.000Z')
    });

    const result = buildReflowSchedule(input);
    expect(result.workOrders.length).toBe(1500);
    expect(result.metrics.totalOrders).toBe(1500);
  });
});

function createSimpleInput(workOrders: WorkOrder[]): ReflowInput {
  return {
    workOrders,
    shifts: [
      { workCenterId: 'WC-1', dayOfWeek: 1, startHour: 8, endHour: 17 },
      { workCenterId: 'WC-1', dayOfWeek: 2, startHour: 8, endHour: 17 },
      { workCenterId: 'WC-1', dayOfWeek: 3, startHour: 8, endHour: 17 },
      { workCenterId: 'WC-1', dayOfWeek: 4, startHour: 8, endHour: 17 },
      { workCenterId: 'WC-1', dayOfWeek: 5, startHour: 8, endHour: 17 }
    ],
    maintenanceWindows: []
  };
}

function createOrder(docId: string, workCenterId: string, startDate: string, endDate: string, durationMinutes = 120): WorkOrder {
  return {
    docId,
    docType: 'workOrder',
    workOrderNumber: docId,
    manufacturingOrderId: 'MO-1',
    operationNumber: 10,
    operationName: 'Operation',
    workCenterId,
    status: 'open',
    startDate,
    endDate,
    durationMinutes,
    isMaintenance: false,
    dependsOnWorkOrderIds: []
  };
}
