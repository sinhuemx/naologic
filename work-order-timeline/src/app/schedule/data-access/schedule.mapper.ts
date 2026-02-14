import {
  ApiManufacturingOrderDocument,
  ApiRoutingDocument,
  ApiScheduleDataset,
  ApiWorkCenterDocument,
  ApiWorkOrderDocument
} from './schedule.api';
import {
  MaintenanceWindow,
  ManufacturingOrder,
  Routing,
  ShiftWindow,
  WorkCenter,
  WorkOrder
} from '../domain/schedule.models';

export interface DomainScheduleDataset {
  workCenters: WorkCenter[];
  manufacturingOrders: ManufacturingOrder[];
  routings: Routing[];
  workOrders: WorkOrder[];
  shiftWindows: ShiftWindow[];
  maintenanceWindows: MaintenanceWindow[];
}

export function mapApiToDomain(dataset: ApiScheduleDataset): DomainScheduleDataset {
  const workCenters = dataset.workCenters.map(mapWorkCenterDocumentToDomain);

  return {
    workCenters,
    manufacturingOrders: dataset.manufacturingOrders.map(mapManufacturingOrderDocumentToDomain),
    routings: dataset.routings.map(mapRoutingDocumentToDomain),
    workOrders: dataset.workOrders.map(mapWorkOrderDocumentToDomain),
    shiftWindows: workCenters.flatMap((workCenter) =>
      workCenter.shifts.map((shift) => ({
        workCenterId: workCenter.id,
        dayOfWeek: shift.dayOfWeek,
        startHour: shift.startHour,
        endHour: shift.endHour
      }))
    ),
    maintenanceWindows: workCenters.flatMap((workCenter) =>
      workCenter.maintenanceWindows.map((window, index) => ({
        id: `${workCenter.id}-MW-${index + 1}`,
        workCenterId: workCenter.id,
        startDate: window.startDate,
        endDate: window.endDate,
        reason: window.reason
      }))
    )
  };
}

export function mapDomainToApi(dataset: DomainScheduleDataset): ApiScheduleDataset {
  return {
    workCenters: dataset.workCenters.map(mapWorkCenterDomainToDocument),
    manufacturingOrders: dataset.manufacturingOrders.map(mapManufacturingOrderDomainToDocument),
    routings: dataset.routings.map(mapRoutingDomainToDocument),
    workOrders: dataset.workOrders.map(mapWorkOrderDomainToDocument)
  };
}

function mapWorkCenterDocumentToDomain(document: ApiWorkCenterDocument): WorkCenter {
  return {
    id: document.docId,
    name: document.data.name,
    shifts: document.data.shifts,
    maintenanceWindows: document.data.maintenanceWindows.map((window, index) => ({
      id: `${document.docId}-MW-${index + 1}`,
      workCenterId: document.docId,
      startDate: window.startDate,
      endDate: window.endDate,
      reason: window.reason
    }))
  };
}

function mapWorkCenterDomainToDocument(workCenter: WorkCenter): ApiWorkCenterDocument {
  return {
    docId: workCenter.id,
    docType: 'workCenter',
    data: {
      name: workCenter.name,
      shifts: workCenter.shifts,
      maintenanceWindows: workCenter.maintenanceWindows.map((window) => ({
        startDate: window.startDate,
        endDate: window.endDate,
        reason: window.reason
      }))
    }
  };
}

function mapManufacturingOrderDocumentToDomain(document: ApiManufacturingOrderDocument): ManufacturingOrder {
  return {
    id: document.docId,
    manufacturingOrderNumber: document.data.manufacturingOrderNumber,
    itemId: document.data.itemId,
    quantity: document.data.quantity,
    dueDate: document.data.dueDate
  };
}

function mapManufacturingOrderDomainToDocument(order: ManufacturingOrder): ApiManufacturingOrderDocument {
  return {
    docId: order.id,
    docType: 'manufacturingOrder',
    data: {
      manufacturingOrderNumber: order.manufacturingOrderNumber,
      itemId: order.itemId,
      quantity: order.quantity,
      dueDate: order.dueDate
    }
  };
}

function mapRoutingDocumentToDomain(document: ApiRoutingDocument): Routing {
  return {
    id: document.docId,
    routingNumber: document.data.routingNumber,
    manufacturingOrderId: document.data.manufacturingOrderId,
    operations: [...document.data.operations].sort((a, b) => a.sequence - b.sequence)
  };
}

function mapRoutingDomainToDocument(routing: Routing): ApiRoutingDocument {
  return {
    docId: routing.id,
    docType: 'routing',
    data: {
      routingNumber: routing.routingNumber,
      manufacturingOrderId: routing.manufacturingOrderId,
      operations: routing.operations.map((operation) => ({
        sequence: operation.sequence,
        operationNumber: operation.operationNumber,
        operationName: operation.operationName,
        workCenterId: operation.workCenterId
      }))
    }
  };
}

function mapWorkOrderDocumentToDomain(document: ApiWorkOrderDocument): WorkOrder {
  return {
    docId: document.docId,
    docType: 'workOrder',
    workOrderNumber: document.data.workOrderNumber,
    manufacturingOrderId: document.data.manufacturingOrderId,
    operationNumber: document.data.operationNumber,
    operationName: document.data.operationName,
    workCenterId: document.data.workCenterId,
    status: document.data.status,
    startDate: document.data.startDate,
    endDate: document.data.endDate,
    durationMinutes: document.data.durationMinutes,
    setupTimeMinutes: document.data.setupTimeMinutes,
    isMaintenance: document.data.isMaintenance,
    dependsOnWorkOrderIds: document.data.dependsOnWorkOrderIds
  };
}

function mapWorkOrderDomainToDocument(order: WorkOrder): ApiWorkOrderDocument {
  return {
    docId: order.docId,
    docType: 'workOrder',
    data: {
      workOrderNumber: order.workOrderNumber,
      manufacturingOrderId: order.manufacturingOrderId,
      operationNumber: order.operationNumber,
      operationName: order.operationName,
      workCenterId: order.workCenterId,
      status: order.status,
      startDate: order.startDate,
      endDate: order.endDate,
      durationMinutes: order.durationMinutes,
      setupTimeMinutes: order.setupTimeMinutes,
      isMaintenance: order.isMaintenance,
      dependsOnWorkOrderIds: order.dependsOnWorkOrderIds
    }
  };
}
