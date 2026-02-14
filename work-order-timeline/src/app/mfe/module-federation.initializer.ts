import { APP_INITIALIZER, Provider } from '@angular/core';
import { ModuleFederationService } from './module-federation.service';

function initializeModuleFederation(service: ModuleFederationService): () => Promise<void> {
  return async () => {
    try {
      await service.loadManifest();
    } catch (error) {
      console.warn('MFE manifest could not be loaded during bootstrap.', error);
    }
  };
}

export const moduleFederationInitializerProvider: Provider = {
  provide: APP_INITIALIZER,
  multi: true,
  deps: [ModuleFederationService],
  useFactory: initializeModuleFederation
};

