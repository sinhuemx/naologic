export type ScheduleDataSourceMode = 'local' | 'api' | 'api-paged';

export interface ScheduleDataSourceConfig {
  mode: ScheduleDataSourceMode;
  apiUrl: string;
  apiPageSize: number;
  fallbackToLocalOnError: boolean;
  logSelection: boolean;
}

export type ScheduleDataSourcePreset = 'api-mocki' | 'api-local';

const SCHEDULE_DATA_SOURCE_PRESETS: Record<ScheduleDataSourcePreset, ScheduleDataSourceConfig> = {
  'api-mocki': {
    mode: 'api',
    // Public test endpoint.
    // Expected payload: ApiScheduleDataset (direct object or wrapped in `scheduleDataset`).
    apiUrl: 'https://api.mocki.io/v2/5j3ufjwo',
    apiPageSize: 0,
    fallbackToLocalOnError: true,
    logSelection: true
  },
  'api-local': {
    mode: 'local',
    // Embedded default dataset from ScheduleService (no backend required).
    apiUrl: '',
    apiPageSize: 0,
    fallbackToLocalOnError: true,
    logSelection: true
  }
};

// Manual switch point (no UI):
// Change only this constant to swap source mode for demos.
export const ACTIVE_SCHEDULE_DATA_SOURCE_PRESET: ScheduleDataSourcePreset = 'api-local';

export const SCHEDULE_DATA_SOURCE_CONFIG: ScheduleDataSourceConfig =
  SCHEDULE_DATA_SOURCE_PRESETS[ACTIVE_SCHEDULE_DATA_SOURCE_PRESET];
