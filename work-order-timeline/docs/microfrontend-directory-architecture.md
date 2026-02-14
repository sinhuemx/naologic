# Microfrontend Directory Architecture (Angular + Module Federation)

## Current snapshot
- `src/app` now has first boundary split:
  - `src/app/schedule/domain/*`
  - `src/app/schedule/data-access/*`
- UI orchestration moved into:
  - `src/app/schedule/feature-shell/schedule-shell.component.*`
- Root app is now a thin host wrapper:
  - `src/app/app.component.*`
- Runtime MFE base lives in:
  - `src/app/mfe/*`
  - `src/assets/mfe.manifest.json`

## Target architecture
Use current repo with **host runtime + internal feature boundaries** first, then extract remotes when needed.

```text
work-order-timeline/
  src/
    app/
      mfe/                       # host runtime services (loader + models)
      schedule/
        feature-shell/           # current in-process orchestrator
        feature-timeline/        # remote mfe: schedule-board
        feature-work-order-form/ # remote mfe: work-order-editor
        data-access/
        domain/
  docs/
    mfe-boundaries.md
    mfe-app-scope.md
```

## Layering rules
- `feature-*` can depend on `ui`, `domain`, `data-access`.
- `domain` must not depend on Angular UI framework code.
- `data-access` owns HTTP + mapping only.
- Shared `types` are versioned contracts between host/remotes.
- No direct import from one remote app into another remote app internals.

## Naming conventions
- Folders by **feature/domain**, not by technical type.
- One concept per file.
- Co-locate test files with implementation.
- Keep all UI code inside `src/`.

## Migration plan (safe sequence)
1. Done: create first code boundaries in current app (`domain`, `data-access`).
2. Next: extract UI into features:
   - `src/app/schedule/feature-timeline`
   - `src/app/schedule/feature-work-order-form`
3. Keep host orchestration in `feature-shell`.
4. Extract first remote (if needed): `schedule-board`.
5. Extract second remote (if needed): `work-order-editor`.
6. Keep dynamic remote manifest for build-once/deploy-everywhere.
7. Add CI gates:
   - boundary rules
   - affected tests/build
   - contract checks for shared types.

## Why this shape
- Enables independent deployability (core microfrontend requirement).
- Keeps domain logic reusable and testable outside UI.
- Reduces coupling and merge conflicts across teams.
- Supports scaling from one team to multiple frontend squads.
