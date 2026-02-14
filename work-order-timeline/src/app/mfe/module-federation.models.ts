export type MfeRemoteFormat = 'script' | 'module';

export interface MfeRemoteDefinition {
  remoteEntry: string;
  remoteName: string;
  exposedModule: string;
  format?: MfeRemoteFormat;
}

export type MfeManifest = Record<string, MfeRemoteDefinition>;

