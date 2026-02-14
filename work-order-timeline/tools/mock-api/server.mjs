import { createServer } from 'node:http';

const PORT = Number(process.env.SCHEDULE_MOCK_PORT ?? 4300);

createServer((req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    const requestUrl = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (requestUrl.pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'schedule-mock-api' });
    }

    if (requestUrl.pathname === '/api/schedule') {
      return handlePagedScheduleRequest(requestUrl, res);
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { error: 'Unexpected error', message: String(error) });
  }
})
  .listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[schedule-mock-api] listening on http://localhost:${PORT}`);
  });

function handlePagedScheduleRequest(requestUrl, res) {
  const page = asPositiveInt(requestUrl.searchParams.get('page'), 1);
  const pageSize = asPositiveInt(requestUrl.searchParams.get('pageSize'), 500);
  const workCenterCount = asPositiveInt(requestUrl.searchParams.get('workCenters'), 120);
  const manufacturingOrderCount = asPositiveInt(requestUrl.searchParams.get('manufacturingOrders'), 2000);
  const operationsPerMo = asPositiveInt(requestUrl.searchParams.get('operationsPerMo'), 5);
  const includeStaticRaw = requestUrl.searchParams.get('includeStatic');
  const includeStatic = includeStaticRaw === null ? page === 1 : includeStaticRaw === 'true';

  const totalWorkOrders = manufacturingOrderCount * operationsPerMo;
  const totalPages = Math.max(1, Math.ceil(totalWorkOrders / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageStartIndex = (safePage - 1) * pageSize + 1;
  const pageEndIndex = Math.min(totalWorkOrders, safePage * pageSize);
  const hasNextPage = safePage < totalPages;

  const scheduleDataset = {
    workCenters: includeStatic ? buildWorkCenters(workCenterCount) : [],
    manufacturingOrders: includeStatic ? buildManufacturingOrders(manufacturingOrderCount) : [],
    routings: includeStatic ? buildRoutings(manufacturingOrderCount, operationsPerMo, workCenterCount) : [],
    workOrders: buildWorkOrdersPage(pageStartIndex, pageEndIndex, operationsPerMo, workCenterCount)
  };

  sendJson(res, 200, {
    page: safePage,
    pageSize,
    totalWorkOrders,
    totalPages,
    hasNextPage,
    scheduleDataset
  });
}

function buildWorkCenters(workCenterCount) {
  const result = [];
  for (let index = 1; index <= workCenterCount; index += 1) {
    result.push({
      docId: `WC-${pad(index, 4)}`,
      docType: 'workCenter',
      data: {
        name: `Work Center ${pad(index, 4)}`,
        shifts: [
          { dayOfWeek: 1, startHour: 8, endHour: 17 },
          { dayOfWeek: 2, startHour: 8, endHour: 17 },
          { dayOfWeek: 3, startHour: 8, endHour: 17 },
          { dayOfWeek: 4, startHour: 8, endHour: 17 },
          { dayOfWeek: 5, startHour: 8, endHour: 17 }
        ],
        maintenanceWindows: []
      }
    });
  }
  return result;
}

function buildManufacturingOrders(manufacturingOrderCount) {
  const result = [];
  for (let index = 1; index <= manufacturingOrderCount; index += 1) {
    result.push({
      docId: `MO-${pad(index, 5)}`,
      docType: 'manufacturingOrder',
      data: {
        manufacturingOrderNumber: `5${pad(index, 6)}`,
        itemId: `ITEM-${pad(index, 5)}`,
        quantity: 100 + (index % 15) * 10,
        dueDate: isoFromOffsetDays(index + 45)
      }
    });
  }
  return result;
}

function buildRoutings(manufacturingOrderCount, operationsPerMo, workCenterCount) {
  const result = [];
  for (let moIndex = 1; moIndex <= manufacturingOrderCount; moIndex += 1) {
    const operations = [];
    for (let opSequence = 1; opSequence <= operationsPerMo; opSequence += 1) {
      const globalOperationIndex = (moIndex - 1) * operationsPerMo + opSequence;
      operations.push({
        sequence: opSequence,
        operationNumber: opSequence * 10,
        operationName: `Operation ${opSequence * 10}`,
        workCenterId: `WC-${pad(((globalOperationIndex - 1) % workCenterCount) + 1, 4)}`
      });
    }

    result.push({
      docId: `RO-${pad(moIndex, 5)}`,
      docType: 'routing',
      data: {
        routingNumber: `R-${pad(moIndex, 5)}`,
        manufacturingOrderId: `MO-${pad(moIndex, 5)}`,
        operations
      }
    });
  }
  return result;
}

function buildWorkOrdersPage(startIndex, endIndex, operationsPerMo, workCenterCount) {
  const result = [];
  for (let orderIndex = startIndex; orderIndex <= endIndex; orderIndex += 1) {
    const operationSequence = ((orderIndex - 1) % operationsPerMo) + 1;
    const moIndex = Math.ceil(orderIndex / operationsPerMo);
    const dependencyId = operationSequence > 1 ? `WO-${pad(orderIndex - 1, 7)}` : null;

    const startDate = new Date(Date.UTC(2026, 0, 1, 8, 0, 0));
    startDate.setUTCMinutes(startDate.getUTCMinutes() + orderIndex * 30);

    const durationMinutes = 60 + ((orderIndex + operationSequence) % 6) * 30;
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    result.push({
      docId: `WO-${pad(orderIndex, 7)}`,
      docType: 'workOrder',
      data: {
        workOrderNumber: `Work Order ${pad(orderIndex, 7)}`,
        manufacturingOrderId: `MO-${pad(moIndex, 5)}`,
        operationNumber: operationSequence * 10,
        operationName: `Operation ${operationSequence * 10}`,
        workCenterId: `WC-${pad(((orderIndex - 1) % workCenterCount) + 1, 4)}`,
        status: selectStatus(orderIndex),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        durationMinutes,
        isMaintenance: false,
        dependsOnWorkOrderIds: dependencyId ? [dependencyId] : []
      }
    });
  }
  return result;
}

function selectStatus(index) {
  const statuses = ['open', 'in-progress', 'complete', 'blocked'];
  return statuses[index % statuses.length];
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  });
  res.end(JSON.stringify(payload));
}

function pad(value, size) {
  return String(value).padStart(size, '0');
}

function asPositiveInt(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function isoFromOffsetDays(offsetDays) {
  const date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
}
