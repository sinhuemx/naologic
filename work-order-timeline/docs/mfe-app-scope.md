# MFE App Scope

This document replaces the old `apps/*` placeholders and keeps only the practical MFE plan.

## Host MFE: `shell`
- Runtime Module Federation host/composition.
- Shared context wiring between remotes.
- Current equivalent in code:
  - `src/app/mfe/*`
  - `src/app/schedule/feature-shell/*`

## Remote MFE: `schedule-board`
- Timeline grid + headers.
- Work center rows in board context.
- Work order bars + actions menu.
- Timescale selector in board context.
- Current equivalent in code:
  - `src/app/schedule/feature-timeline/*`

## Remote MFE: `work-order-editor`
- Right-side panel UI.
- Form UX + validation behaviors.
- Create/Edit/Cancel flows.
- Current equivalent in code:
  - `src/app/schedule/feature-work-order-form/*`
