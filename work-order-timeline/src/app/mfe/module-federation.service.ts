import { Injectable } from '@angular/core';
import { MfeManifest, MfeRemoteDefinition } from './module-federation.models';

interface ModuleFederationContainer {
  init: (shareScope: unknown) => Promise<void>;
  get: (module: string) => Promise<() => unknown>;
}

declare global {
  interface Window {
    __mfe_manifest__?: MfeManifest;
    [key: string]: unknown;
  }
}

type WebpackSharingApi = {
  __webpack_init_sharing__?: (scope: string) => Promise<void>;
  __webpack_share_scopes__?: Record<string, unknown>;
};

@Injectable({ providedIn: 'root' })
export class ModuleFederationService {
  private readonly scriptLoadCache = new Map<string, Promise<void>>();
  private readonly containerInitCache = new Map<string, Promise<void>>();
  private manifest: MfeManifest = {};

  async loadManifest(url = 'assets/mfe.manifest.json'): Promise<MfeManifest> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Could not load MFE manifest from "${url}"`);
    }

    const parsed = (await response.json()) as MfeManifest;
    this.manifest = parsed;
    window.__mfe_manifest__ = parsed;
    return parsed;
  }

  getManifest(): MfeManifest {
    return { ...this.manifest };
  }

  registerRemote(remoteKey: string, definition: MfeRemoteDefinition): void {
    this.manifest = { ...this.manifest, [remoteKey]: definition };
    window.__mfe_manifest__ = this.manifest;
  }

  async loadRemoteModule<T = unknown>(remoteKey: string): Promise<T> {
    const definition = this.manifest[remoteKey];
    if (!definition) {
      throw new Error(`Remote "${remoteKey}" is not defined in the MFE manifest.`);
    }

    await this.loadRemoteEntry(definition);
    const container = this.resolveContainer(definition.remoteName);
    await this.initializeContainer(definition.remoteName, container);
    const factory = await container.get(definition.exposedModule);
    return factory() as T;
  }

  private async loadRemoteEntry(definition: MfeRemoteDefinition): Promise<void> {
    const key = `${definition.format ?? 'script'}::${definition.remoteEntry}`;
    if (this.scriptLoadCache.has(key)) {
      return this.scriptLoadCache.get(key)!;
    }

    const loader = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = definition.remoteEntry;
      script.type = definition.format === 'module' ? 'module' : 'text/javascript';
      script.async = true;
      script.onerror = () => reject(new Error(`Could not load remote entry ${definition.remoteEntry}`));
      script.onload = () => resolve();
      document.head.appendChild(script);
    });

    this.scriptLoadCache.set(key, loader);
    return loader;
  }

  private resolveContainer(remoteName: string): ModuleFederationContainer {
    const candidate = window[remoteName];
    if (!candidate) {
      throw new Error(`Remote container "${remoteName}" was not found on window.`);
    }

    return candidate as ModuleFederationContainer;
  }

  private async initializeContainer(remoteName: string, container: ModuleFederationContainer): Promise<void> {
    if (this.containerInitCache.has(remoteName)) {
      return this.containerInitCache.get(remoteName)!;
    }

    const initPromise = (async () => {
      const sharingApi = globalThis as typeof globalThis & WebpackSharingApi;
      if (sharingApi.__webpack_init_sharing__) {
        await sharingApi.__webpack_init_sharing__('default');
      }

      await container.init(sharingApi.__webpack_share_scopes__?.['default'] ?? {});
    })();

    this.containerInitCache.set(remoteName, initPromise);
    return initPromise;
  }
}

