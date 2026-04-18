import test from 'node:test';
import assert from 'node:assert/strict';
import { mapKeyToAction } from './keymap.js';

test('j and down arrow move selection forward', () => {
  assert.deepEqual(mapKeyToAction('j'), { type: 'MOVE_SELECTION', delta: 1 });
  assert.deepEqual(mapKeyToAction('down'), { type: 'MOVE_SELECTION', delta: 1 });
});

test('q maps to quit', () => {
  assert.deepEqual(mapKeyToAction('q'), { type: 'QUIT' });
});

test('/ opens shell search', () => {
  assert.deepEqual(mapKeyToAction('/'), { type: 'SEARCH' });
});
