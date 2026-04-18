import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from './types.js';
import { reducer } from './reducer.js';

test('MOVE_MODULE advances selection inside the command rail', () => {
  const initial = createInitialState();
  const next = reducer(initial, { type: 'MOVE_MODULE', delta: 1 });

  assert.equal(next.activeModule, 'providers');
  assert.equal(next.focusRegion, 'nav');
});
