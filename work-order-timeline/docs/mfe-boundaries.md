# MFE Boundaries (Current Product Scope)

## Goal
Define only the microfrontends that map to real product boundaries in the current app.

## MFE Pattern
- `Shell (Host)`: current orchestrator and runtime loader.
  - `src/app/schedule/feature-shell/*`
  - `src/app/mfe/*`
- `Remotes`: feature boundaries extracted from current app.
  - `schedule-board` (remote mfe)
  - `work-order-editor` (remote mfe)

## MFE 1: `schedule-board`

### Owns
- Timeline grid and time headers.
- Work center rows in board context.
- Work order bars and actions menu (`Edit`, `Delete`).
- Timescale switch (`Hour/Day/Week/Month`) in board context.

### Depends on
- `schedule/domain` for models and scheduling rules.
- `schedule/data-access` for data retrieval/update.
- Shared contracts/events from host.

### Public contract (host <-> remote)
- Input:
  - `workCenters: WorkCenter[]`
  - `workOrders: WorkOrder[]`
  - `selectedZoom: ZoomLevel`
- Output events:
  - `openCreate(workCenterId: string, date: string)`
  - `openEdit(workOrderId: string)`
  - `delete(workOrderId: string)`
  - `zoomChanged(zoom: ZoomLevel)`

## MFE 2: `work-order-editor`

### Owns
- Right-side panel (`Work Order Details`).
- Form state and UI validation behavior.
- UX interactions for create/edit/cancel.

### Depends on
- `schedule/domain` models and validation primitives.
- `schedule/data-access` for create/update actions.
- Input context provided by host (selected order / defaults).

### Public contract (host <-> remote)
- Input:
  - `mode: 'create' | 'edit'`
  - `workOrder?: WorkOrder`
  - `workCenters: WorkCenter[]`
- Output events:
  - `save(workOrderDraft: WorkOrder)`
  - `cancel()`
  - `validationError(message: string)`

## Should remain shared (NOT MFE)
- `schedule/domain/*`:
  - `schedule.models.ts`
  - `schedule-engine.ts`
- `schedule/data-access/*`:
  - API contracts, mappers, service facade.

These are cross-cutting rules and data contracts; splitting them into separate remotes would increase duplication and drift risk.

## Rollout order
1. Keep current app running as host runtime.
2. Extract board UI into `schedule-board`.
3. Extract panel form into `work-order-editor`.
4. Keep domain + data-access shared and versioned.
