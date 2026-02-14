# feature-work-order-form
Work order side panel extracted from `schedule-shell`.

Current responsibility:
- Render create/edit side panel UI
- Handle field-level visual validation state
- Emit close/save/date-change events

Contract shape:
- Input data only (`panelOpen`, `orderForm`, `statusOptions`, `submitted`, etc.)
- Output events only (`closePanel`, `saveOrder`)
- No callback function inputs, to keep remote integration predictable

Target MFE:
- `work-order-editor` (remote mfe)
