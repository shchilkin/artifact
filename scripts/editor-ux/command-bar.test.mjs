import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstEditMovePx } from './command-bar.mjs';

test('first-edit movement is the largest x change of any command-bar button', () => {
  assert.equal(firstEditMovePx({ undoEnabledBefore: false, before: [8, 70, 120], after: [8, 70, 120] }), 0);
  assert.equal(firstEditMovePx({ undoEnabledBefore: false, before: [8, 70, 120], after: [8, 90, 140] }), 20);
});

test('a button that appears or disappears moves by its whole offset', () => {
  assert.equal(firstEditMovePx({ undoEnabledBefore: false, before: [8, 70], after: [8, 70, 120] }), 120);
});

test('the measurement fails when Undo was not disabled before the edit', () => {
  assert.throws(
    () => firstEditMovePx({ undoEnabledBefore: true, before: [8], after: [8] }),
    /Undo must be disabled before the first edit \(was enabled\)/,
  );
  assert.throws(
    () => firstEditMovePx({ undoEnabledBefore: null, before: [8], after: [8] }),
    /Undo must be disabled before the first edit \(was not found\)/,
  );
});
