# Module Federation Runtime (Shell + Remotes)

This project runs as a **Shell (Host)** with runtime Module Federation support.

## Roles
- `Shell (Host)`: loads remote entries, shares context, orchestrates UI composition.
- `Remote`: independently built artifact that exposes a module via Module Federation.

Current shell runtime:
- `src/app/mfe/module-federation.service.ts`
- `src/app/mfe/module-federation.models.ts`
- `src/app/mfe/module-federation.initializer.ts`
- `src/assets/mfe.manifest.json`

## Remote registration (manifest)
Define each remote in `src/assets/mfe.manifest.json`:

```json
{
  "reactRemote": {
    "remoteEntry": "http://localhost:4301/remoteEntry.js",
    "remoteName": "reactRemote",
    "exposedModule": "./Mount",
    "format": "script"
  }
}
```

## Recommended remote contract
Use one stable cross-framework contract in each remote:

```ts
export interface RemoteMountModule {
  mount: (el: HTMLElement, props?: unknown) => void | Promise<void>;
  unmount?: (el: HTMLElement) => void | Promise<void>;
}
```

Then the shell can load any framework remote the same way:

```ts
const remote = await moduleFederationService.loadRemoteModule<RemoteMountModule>('reactRemote');
await remote.mount(containerEl, { userId: '123' });
```

## Connect React remote
- Build remote with Module Federation plugin.
- Expose `./Mount` with `mount/unmount` functions.
- In `mount`, render React app into `el`.
- In `unmount`, call React unmount.

## Connect Vue remote
- Build remote with Module Federation plugin.
- Expose `./Mount`.
- In `mount`, `createApp(...).mount(el)`.
- In `unmount`, call `app.unmount()`.

## Connect Ember remote
- Build remote with Module Federation plugin or wrapper build that exposes `./Mount`.
- Expose `mount/unmount` in a small adapter module.
- In `mount`, bootstrap Ember application/component into `el`.
- In `unmount`, destroy the Ember instance.

## Notes
- Keep shared data contracts framework-agnostic (plain TS interfaces/JSON).
- Prefer event callbacks/DTO props instead of direct cross-app service references.
- Version remote contracts to avoid shell/remote drift.
