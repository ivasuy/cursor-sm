import type { FocusRegion, ModuleId } from './types.js';

export type Action =
  | { type: 'BOOT_TICK' }
  | { type: 'BOOT_COMPLETE' }
  | { type: 'MOVE_MODULE'; delta: 1 | -1 }
  | { type: 'FOCUS_REGION'; region: FocusRegion }
  | { type: 'MOVE_SELECTION'; module: ModuleId; delta: 1 | -1; max: number }
  | { type: 'SET_STATUS'; message: string };
