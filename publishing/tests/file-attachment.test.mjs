import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>');
for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'getComputedStyle', 'DOMParser']) {
  try { globalThis[key] = dom.window[key]; } catch { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true }); }
}
const { createMemoEditor, formatFileSize } = await import('../src/editor.js');

const ID = '123e4567-e89b-12d3-a456-426614174000';
const doc = { type: 'doc', content: [{ type: 'fileAttachment', attrs: { id: ID, name: '보고서 <1>.pdf', size: 2_621_440 } }] };

test('formatFileSize', () => {
  assert.equal(formatFileSize(500), '500 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(2_621_440), '2.5 MB');
  assert.equal(formatFileSize(-1), '');
});

test('첨부 카드는 다운로드 링크로 렌더링되고 JSON 왕복이 유지된다', () => {
  const element = dom.window.document.createElement('div'); dom.window.document.body.append(element);
  const editor = createMemoEditor({ element, content: doc, editable: false });
  const link = element.querySelector('.memo-file-card a');
  assert.equal(link.getAttribute('href'), `/memo-files/${ID}/`);
  assert.equal(link.getAttribute('download'), '보고서 <1>.pdf');
  assert.equal(element.querySelector('.memo-file-name').textContent, '보고서 <1>.pdf');
  assert.equal(element.querySelector('.memo-file-size').textContent, '2.5 MB');
  assert.deepEqual(JSON.parse(JSON.stringify(editor.getJSON().content[0].attrs)), { id: ID, name: '보고서 <1>.pdf', size: 2_621_440 });
  editor.destroy();
});

test('잘못된 id 는 링크로 쓰이지 않는다', () => {
  const element = dom.window.document.createElement('div'); dom.window.document.body.append(element);
  const editor = createMemoEditor({ element, content: { type: 'doc', content: [{ type: 'fileAttachment', attrs: { id: '../../x', name: 'a.pdf', size: 1 } }] }, editable: false });
  assert.equal(element.querySelector('.memo-file-card a').getAttribute('href'), '#');
  editor.destroy();
});
