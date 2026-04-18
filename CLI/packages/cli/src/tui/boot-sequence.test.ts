import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBootFrames } from './boot-sequence.js';

test('boot sequence stays within the approved cinematic window', () => {
  const frames = buildBootFrames();
  const totalDuration = frames.reduce((sum, frame) => sum + frame.durationMs, 0);

  assert.ok(totalDuration >= 1000);
  assert.ok(totalDuration <= 2000);
});
