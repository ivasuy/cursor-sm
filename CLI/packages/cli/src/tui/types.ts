export type ModuleId =
  | 'deck'
  | 'providers'
  | 'repos'
  | 'worktrees'
  | 'features'
  | 'files'
  | 'watch'
  | 'report';

export type FocusRegion = 'nav' | 'content' | 'inspector' | 'footer';

export interface AppState {
  bootComplete: boolean;
  bootFrameIndex: number;
  activeModule: ModuleId;
  focusRegion: FocusRegion;
  selectedIndexByModule: Record<ModuleId, number>;
  statusMessage: string;
}

export function createInitialState(): AppState {
  return {
    bootComplete: false,
    bootFrameIndex: 0,
    activeModule: 'deck',
    focusRegion: 'nav',
    selectedIndexByModule: {
      deck: 0,
      providers: 0,
      repos: 0,
      worktrees: 0,
      features: 0,
      files: 0,
      watch: 0,
      report: 0,
    },
    statusMessage: 'booting shell',
  };
}
