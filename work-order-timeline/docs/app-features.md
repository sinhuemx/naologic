# App Features

## Features Implemented

- Timeline with zooms: `Hour`, `Day`, `Week`, `Month`
- Work center lane grid with horizontal scrolling
- Current month badge + today indicator
- Work order bars by status with action menu (`Edit`, `Delete`)
- Create/edit side panel with Reactive Form
- Overlap validation for work center conflicts
- Signals-based UI state handling
- Optional year-guard feature flag in shell (`enforceCurrentYearValidation`)
- Reflow engine with dependency + work-center conflict handling
- Cycle detection for invalid dependency graphs
- Synthetic large dataset generator for stress scenarios (1k+ work orders)
- Automatic reflow cascade on create/edit save (default mode)

## Evaluation Coverage

The following client evaluation points are explicitly covered:

- **Reflow algorithm**:
  - `buildReflowSchedule(...)` in `src/app/schedule/domain/schedule-engine.ts`
  - Handles dependency ordering, work-center contention, and scheduling cascade
  - Applied automatically on save in `schedule-shell` (ERP-like behavior)
- **Hard constraints**:
  - Dependency checks + missing dependency detection
  - No overlap per work center
  - Cycle detection (`CYCLE_DETECTED`)
- **Data hierarchy support**:
  - MO, Routing, WO, WC structures in `data-access`/`domain` models
- **Large data scenarios**:
  - `generateSyntheticReflowInput(...)` supports thousands of work orders
- **Metrics and observability**:
  - Runtime and delay metrics emitted to browser console via `console.table`

## Evaluation Matrix (What Is Applied Where)

| Point | Status | Where in code |
|---|---|---|
| Reflow Algorithm (cascade) | Implemented | `src/app/schedule/domain/schedule-engine.ts:94`, applied on save at `src/app/schedule/feature-shell/schedule-shell.component.ts:273` and `src/app/schedule/feature-shell/schedule-shell.component.ts:292` |
| MO → Routing → WO → WC | Implemented | Domain contracts in `src/app/schedule/domain/schedule.models.ts:3`, `src/app/schedule/domain/schedule.models.ts:18`, `src/app/schedule/domain/schedule.models.ts:53`, `src/app/schedule/domain/schedule.models.ts:31` |
| Routing mapping + ingestion | Implemented | API model `src/app/schedule/data-access/schedule.api.ts:30`, mapper `src/app/schedule/data-access/schedule.mapper.ts:117`, service state `src/app/schedule/data-access/schedule.service.ts:11` |
| Hard constraints: Time | Implemented | Shift + maintenance scheduling in `src/app/schedule/domain/schedule-engine.ts:404`, `src/app/schedule/domain/schedule-engine.ts:456`, `src/app/schedule/domain/schedule-engine.ts:492` |
| Hard constraints: Dependencies (DAG) | Implemented | DAG + cycle + routing dependencies in `src/app/schedule/domain/schedule-engine.ts:280`, `src/app/schedule/domain/schedule-engine.ts:323`, `src/app/schedule/domain/schedule-engine.ts:343` |
| Hard constraints: Location (WC conflicts) | Implemented | Per-work-center cursor guard in `src/app/schedule/domain/schedule-engine.ts:114` and `src/app/schedule/domain/schedule-engine.ts:150` |
| Thousands of data + benchmark | Implemented | Synthetic input `src/app/schedule/domain/schedule-engine.ts:199`, benchmark entrypoint `src/app/schedule/feature-shell/schedule-shell.component.ts:369`, debug hook `src/app/schedule/feature-shell/schedule-shell.component.ts:413` |
| Metrics visible in browser | Implemented | Metrics and issues via `console.table` in `src/app/schedule/feature-shell/schedule-shell.component.ts:430` and `src/app/schedule/feature-shell/schedule-shell.component.ts:441` |

## Large Data Strategy (Current)

Recommended for this challenge:

1. Primary demo path: **local default dataset** (`api-local`)  
Reason: stable startup without backend dependency, ideal for baseline demos.

2. Complementary benchmark path: **in-code synthetic generator** (`generateSyntheticReflowInput`)  
Reason: deterministic and fast for stress checks.

3. External provider (`api-mocki`): **optional smoke-check path**  
Reason: useful to validate external endpoint shape, but not ideal for large-scale tests.

## Data Source Modes

Manual switch in code (no UI controls):
- `src/app/schedule/data-access/schedule.datasource.config.ts`
- Change `ACTIVE_SCHEDULE_DATA_SOURCE_PRESET` to:
  - `'api-mocki'` (loads `apiUrl`, replace with your endpoint)
  - `'api-local'` (loads embedded default dataset from `ScheduleService`)

Notes for client demo:
- Startup preset is `api-local` by default.
- Timeline range is dynamic and data-driven (min/max dates from loaded work orders + padding), so it is not limited to fixed years.
- **Primary demo mode (`api-local`):**
  - Uses embedded default dataset without DB/network dependency.
- **Alternative endpoint mode (`api-mocki`):**
  - Uses static external endpoint for quick API smoke checks.
- **Optional stress mode (paged local API):**
  - `window.scheduleDebug?.usePagedDatasetUrl('http://localhost:4300/api/schedule', 500)`
  - Requires `npm run start:mock-api`.

Data-source switching is exposed in shell debug tools:
- `window.scheduleDebug.useDefaultData()`
- `window.scheduleDebug.useSyntheticData(orderCount)`
- `window.scheduleDebug.useDatasetUrl(url)`
- `window.scheduleDebug.usePagedDatasetUrl(url, pageSize)`

## Reflow Demo Commands (Browser Console)

With the app running in the browser, use:

```ts
// Reflow current schedule loaded in UI
window.scheduleDebug?.runReflow();

// Run synthetic benchmark (default 1000)
window.scheduleDebug?.benchmark();

// Run synthetic benchmark with custom size
window.scheduleDebug?.benchmark(5000);

// Switch mode for demos/comparison
window.scheduleDebug?.setReflowMode('automatic'); // default / recommended
window.scheduleDebug?.setReflowMode('manual');    // overlap-only save behavior

// Restore startup dataset
window.scheduleDebug?.useDefaultData();

// Load many records into UI
window.scheduleDebug?.useSyntheticData(5000);

// Load direct dataset endpoint
window.scheduleDebug?.useDatasetUrl('https://api.mocki.io/v2/5j3ufjwo');

// Load paged API dataset
window.scheduleDebug?.usePagedDatasetUrl('http://localhost:4300/api/schedule', 500);
```

Console output includes:
- Metrics table (`totalOrders`, `movedOrders`, `totalDelayMinutes`, `runtimeMs`, etc.)
- Top moved orders table
- Issue count table

## Demo Script (5 min)

Use this order during the client presentation:

1. **Baseline UI + default data**
   - Confirm app starts in `Month` view.
   - Run:
   ```ts
   window.scheduleDebug?.useDefaultData();
   ```
2. **Automatic cascade reflow (core requirement)**
   - Keep automatic mode:
   ```ts
   window.scheduleDebug?.setReflowMode('automatic');
   ```
   - Edit or create one work order from the side panel and save.
   - Show `console.table` output (moved orders, delay, runtime).
3. **Current schedule validation/reflow**
   - Run:
   ```ts
   window.scheduleDebug?.runReflow();
   ```
   - Explain constraint handling (dependency + work center + shifts/maintenance).
4. **Large volume benchmark**
   - Run:
   ```ts
   window.scheduleDebug?.benchmark(5000);
   ```
   - Show runtime and issue counts in console.
5. **Optional data source switch**
   - External API smoke check:
   ```ts
   window.scheduleDebug?.useDatasetUrl('https://api.mocki.io/v2/5j3ufjwo');
   ```
   - Back to local baseline:
   ```ts
   window.scheduleDebug?.useDefaultData();
   ```

## Reflow Mode Decision

- **Best practice for ERP scheduling:** `automatic` reflow by default.
  - Reason: planners expect downstream cascade to be resolved immediately after a change.
  - Reduces manual correction cycles and keeps schedule consistently valid.
- `manual` mode is preserved for diagnostics/demos and behavior comparison.

## Notes

- The app currently runs as a single Angular app with explicit internal boundaries ready for remote extraction.
- Runtime Module Federation support is active through `src/app/mfe/*` and `src/assets/mfe.manifest.json`.
- See `docs/module-federation-runtime.md`, `docs/mfe-boundaries.md`, and `docs/mfe-app-scope.md`.

## Cross-Framework Remote Scope

This architecture can host remotes built with other frameworks (`React`, `Vue`, `Ember`, etc.) using Module Federation.

Minimal flow:
1. Build the remote app and expose one entry module/component.
2. Publish its `remoteEntry.js` URL.
3. Register it in `src/assets/mfe.manifest.json`.
4. Load it from the Angular host with `module-federation.service.ts`.
5. Mount it inside a host wrapper area (route or feature slot) and exchange data via explicit contracts (inputs/events).

Result: each team can ship independently, while the host keeps orchestration, auth/session context, and navigation consistency.

## Code Health Review

### Cleanup performed
- Removed non-runtime placeholders/directories that were not used by the running app:
  - `libs/`
  - `dist/` (build artifact)
- Removed `src/.DS_Store`.
- Removed empty router wiring not used in runtime:
  - deleted `src/app/app.routes.ts`
  - removed `provideRouter(...)` from `src/app/app.config.ts`
- Removed dead code in shell timeline:
  - unused `buildMonthColumns(...)`
  - unused `daysBetween(...)`
  - unused `title` field in `ScheduleShellComponent`

### DRY assessment
- Current code is in good shape for DRY at feature boundaries:
  - `feature-shell` orchestrates state/flows.
  - `feature-timeline` and `feature-work-order-form` are focused UI blocks.
- Shared transformations already centralized in:
  - `src/app/schedule/data-access/schedule.mapper.ts`
- Shared domain contracts centralized in:
  - `src/app/schedule/domain/schedule.models.ts`
- Remaining duplication is low and mostly intentional for clarity in timeline date formatting and UI-specific behaviors.

### TypeScript paradigm used
This codebase uses a **hybrid paradigm**:
- **Reactive programming**:
  - Angular Signals (`signal`, `computed`, `effect`) for state derivation and UI updates.
- **Component-oriented OOP**:
  - class-based Angular standalone components/services with dependency injection.
- **Functional style**:
  - pure helper functions for timeline/date math and mapping.
  - pure mapping functions in `data-access` to transform API/domain models.
