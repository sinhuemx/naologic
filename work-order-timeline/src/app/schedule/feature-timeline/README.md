# feature-timeline
Timeline board UI extracted from `schedule-shell`.

Current responsibility:
- Render top nav + timeline board layout
- Render timescale dropdown UI and emit interactions
- Render work center rows and hover states
- Render timeline bars, status badges, and actions menu
- Emit board interactions only (no scheduling business logic)

Contract shape:
- Input data only (`workCenters`, `timelineVm`, `ordersByCenter`, `statusOptions`, etc.)
- Output events only (`selectZoom`, `gridClick`, `startEdit`, `deleteOrder`, etc.)
- No callback function inputs, to keep MFE boundary clean

Target MFE:
- `schedule-board` (remote mfe)
