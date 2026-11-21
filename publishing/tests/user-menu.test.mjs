import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMenuIndex } from '../src/user-menu.js';
test('nextMenuIndex 이동과 순환', () => {
  assert.equal(nextMenuIndex(-1, 2, 'ArrowDown'), 0);
  assert.equal(nextMenuIndex(1, 2, 'ArrowDown'), 0);
  assert.equal(nextMenuIndex(0, 2, 'ArrowUp'), 1);
  assert.equal(nextMenuIndex(-1, 2, 'ArrowUp'), 1);
  assert.equal(nextMenuIndex(0, 2, 'End'), 1);
  assert.equal(nextMenuIndex(1, 2, 'Home'), 0);
  assert.equal(nextMenuIndex(0, 0, 'ArrowDown'), -1);
});