# Work Order Schedule Timeline

## Tech Stack

- Angular 19 (standalone architecture)
- TypeScript (strict mode)
- SCSS
- Signals + Reactive Forms
- `@ng-select/ng-select` for custom select controls
- Runtime Module Federation foundation (manifest + dynamic loader)

## Quick Start

```bash
cd work-order-timeline
npm install
npm run start:app
```

Open `http://localhost:4200/`.

## Scripts

```bash
# Angular app only (default `api-local`, no backend required)
npm run start:app

# Local paged mock API (Node, no DB)
npm run start:mock-api

# Development stack (Angular + local paged mock API)
npm start

# Production build
npx ng build

# Unit tests
npx ng test

# Type-check app/spec
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
./node_modules/.bin/tsc -p tsconfig.spec.json --noEmit
```

## Current Architecture

```text
work-order-timeline/
├─ src/
│  ├─ assets/
│  │  └─ mfe.manifest.json
│  └─ app/
│     ├─ mfe/                 # runtime module federation services
│     └─ schedule/
│        ├─ domain/           # types + scheduling engine
│        ├─ data-access/      # api/mapper/service
│        ├─ feature-shell/    # current in-process orchestrator
│        ├─ feature-timeline/ # timeline UI boundary
│        └─ feature-work-order-form/ # side-panel UI boundary
└─ docs/                      # architecture and MFE docs
```

## MFE Diagram (Current State)

```text
                 Shell (Host - Angular app)
                          |
                          v
                 src/app/app.component
                          |
                          v
            src/app/schedule/feature-shell
               (current shell orchestrator)
                          |
          +---------------+----------------+
          |                                |
          v                                v
 src/app/schedule/feature-timeline   src/app/schedule/feature-work-order-form
 (remote mfe: schedule-board)  (remote mfe: work-order-editor)

 Cross-cutting runtime:
 - src/app/mfe/*
 - src/assets/mfe.manifest.json
```

## MFE Roles

- `MFE`: Microfrontend unit.
- `Module Federation`: runtime loading/composition mechanism used to deliver MFEs.
- `Shell (Host)`: owns orchestration, runtime loading, shared context.
- `Remote`: independently built/exposed module loaded by shell.
- Current remote MFEs:
  - `schedule-board` <- `src/app/schedule/feature-timeline/*`
  - `work-order-editor` <- `src/app/schedule/feature-work-order-form/*`

## Feature Docs

Detailed implementation, evaluation, large-data strategy, debug commands, demo script, and code-health notes:
- `docs/app-features.md`

## Docs Guide

- `docs/app-features.md`: implemented features, evaluation coverage, large-data strategy, demo/debug commands, and code-health notes.
- `docs/module-federation-runtime.md`: runtime federation setup (manifest, loader, initializer) and how shell/remotes are resolved.
- `docs/microfrontend-directory-architecture.md`: target folder architecture and migration path from in-process features to remote MFEs.
- `docs/mfe-boundaries.md`: functional boundaries/responsibilities for each MFE and shared layers that must stay centralized.
- `docs/mfe-app-scope.md`: current host/remote MFE scope and extraction plan for each app.



## Created By
 - Carlos Sinhue García Hernández
