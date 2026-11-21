import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTEBOOK_NAME_MAX, normalizeNotebookName, hasDuplicateNotebookName } from '../src/notebook-name.js';

test('normalizeNotebookName: 공백 제거와 길이 제한', () => {
  assert.equal(normalizeNotebookName('  나의 하루  '), '나의 하루');
  assert.equal(normalizeNotebookName(''), null);
  assert.equal(normalizeNotebookName('   '), null);
  assert.equal(normalizeNotebookName(null), null);
  assert.equal(normalizeNotebookName('가'.repeat(NOTEBOOK_NAME_MAX)), '가'.repeat(NOTEBOOK_NAME_MAX));
  assert.equal(normalizeNotebookName('가'.repeat(NOTEBOOK_NAME_MAX + 1)), null);
});

test('hasDuplicateNotebookName: 자기 자신은 제외', () => {
  const list = [{ id: 'a', name: '일상 기록' }, { id: 'b', name: '개발 노트' }];
  assert.equal(hasDuplicateNotebookName(list, '개발 노트'), true);
  assert.equal(hasDuplicateNotebookName(list, '개발 노트', 'b'), false);
  assert.equal(hasDuplicateNotebookName(list, '새 이름', 'a'), false);
});