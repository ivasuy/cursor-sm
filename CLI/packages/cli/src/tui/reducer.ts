import type { Action } from './actions.js';
import type { AppState, ModuleId } from './types.js';

const MODULE_ORDER: ModuleId[] = [
  'deck',
  'providers',
  'repos',
  'worktrees',
  'features',
  'files',
  'watch',
  'report',
];

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'BOOT_TICK':
      return { ...state, bootFrameIndex: state.bootFrameIndex + 1 };
    case 'BOOT_COMPLETE':
      return { ...state, bootComplete: true, statusMessage: 'command deck online' };
    case 'MOVE_MODULE': {
      const current = MODULE_ORDER.indexOf(state.activeModule);
      const nextIndex = Math.max(0, Math.min(MODULE_ORDER.length - 1, current + action.delta));
      return { ...state, activeModule: MODULE_ORDER[nextIndex], focusRegion: 'nav' };
    }
    case 'FOCUS_REGION':
      return { ...state, focusRegion: action.region };
    case 'MOVE_SELECTION': {
      const current = state.selectedIndexByModule[action.module];
      const next = Math.max(0, Math.min(Math.max(action.max - 1, 0), current + action.delta));
      return {
        ...state,
        selectedIndexByModule: {
          ...state.selectedIndexByModule,
          [action.module]: next,
        },
      };
    }
    case 'SET_STATUS':
      return { ...state, statusMessage: action.message };
    default:
      return state;
  }
}
