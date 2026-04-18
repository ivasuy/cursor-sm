export type KeyAction =
  | { type: 'MOVE_SELECTION'; delta: 1 | -1 }
  | { type: 'MOVE_MODULE'; delta: 1 | -1 }
  | { type: 'DRILL_IN' }
  | { type: 'BACK' }
  | { type: 'SEARCH' }
  | { type: 'QUIT' };

export function mapKeyToAction(name: string): KeyAction | null {
  switch (name) {
    case 'j':
    case 'down':
      return { type: 'MOVE_SELECTION', delta: 1 };
    case 'k':
    case 'up':
      return { type: 'MOVE_SELECTION', delta: -1 };
    case 'l':
    case 'right':
      return { type: 'MOVE_MODULE', delta: 1 };
    case 'h':
    case 'left':
      return { type: 'MOVE_MODULE', delta: -1 };
    case 'enter':
      return { type: 'DRILL_IN' };
    case 'escape':
      return { type: 'BACK' };
    case '/':
      return { type: 'SEARCH' };
    case 'q':
      return { type: 'QUIT' };
    default:
      return null;
  }
}
