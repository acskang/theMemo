import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { createAdapter } from '../src/adapters.js';
import { localDate, newDocument, sampleNotes } from '../src/sample-data.js';
import { normalizeDestinationURL, normalizeImageAttrs, normalizeYouTubeURL, plainText, safeImage, youtubeURLFromThumbnail } from '../src/editor.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, message) {
  for (let i = 0; i < 100; i++) { if (fn()) return; await delay(30); }
  throw Error(message || 'condition not met');
}
async function boot(database = new IDBFactory(), storageKey = 'smoke') {
  let html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  html = html.replace('<script type="module" src="/src/main.js"></script>', '');
  html = html.replace('theMemo-publishing-v1', storageKey);
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!/navigation|Not implemented.*scroll|stylesheet/i.test(error.message)) errors.push(error.message); });
  vc.on('error', error => errors.push(error?.message || String(error)));
  // Define a minimal Element constructor before jsdom creates the window so
  // that Alpine.js sees a valid `window.Element` during module evaluation.
  globalThis.Element = function() {};
  const dom = new JSDOM(html, { url: 'https://memo.test/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  // Extend the jsdom document with missing APIs expected by htmx and
  // other libraries.
  // Provide a global `document` that proxies the jsdom document and supplies
  // the missing `createExpression` method required by htmx.
  globalThis.document = new Proxy(w.document, {
    get(target, prop) {
      if (prop === 'createExpression') return () => ({ evaluate: () => [] });
      return target[prop];
    }
  });
  globalThis.document = w.document;
  // jsdom in this environment may not expose the Element constructor, which
  // Alpine.js expects to exist when the bundled script is evaluated.
  // Polyfill Element if it is missing to prevent runtime errors during test
  // bootstrapping.  The stub provides a minimal constructor and empty
  // prototype so that Alpine's assignments (e.g. `_x_toggleAndCascadeWithTransitions`)
  // succeed without affecting other DOM interactions used in the tests.
  if (typeof w.Element !== 'function') {
    w.Element = function () {};
  }
  if (!w.Element.prototype) {
    w.Element.prototype = {};
  }
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.indexedDB = database; w.structuredClone = structuredClone; w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.Range.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  w.Range.prototype.getClientRects = () => [];
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  // htmx's XPath helper calls the DOM Level 3 evaluate overload that JSDOM omits.
  const evaluate = w.XPathExpression.prototype.evaluate;
  w.XPathExpression.prototype.evaluate = function(context, type, result) { return evaluate.call(this, context, type ?? 0, result ?? null); };
  const file = readdirSync(new URL('../dist/assets', import.meta.url)).find(name => name.endsWith('.js'));
  // Prepend a safe Element constructor so Alpine.js can attach its helper
  // functions without throwing when running in jsdom environments that
  // expose an undefined `window.Element`. This guard is local to the eval
  // invocation and does not affect production builds.
  w.eval(`(function(){
    if (typeof window.Element !== "function") {
      Object.defineProperty(window, 'Element', { value: function() {}, writable: true, configurable: true });
    }
    ${readFileSync(new URL(`../dist/assets/${file}`, import.meta.url), 'utf8')}
  })();`);
  await waitFor(() => w.document.body.dataset.ready || !w.document.getElementById('boot-error').hidden, 'app did not boot');
  assert.equal(w.document.getElementById('boot-error').hidden, true, w.document.getElementById('boot-error').textContent);
  return { dom, w, d: w.document, errors, close() { w.SmartMemo.destroy(); dom.window.close(); } };
}
const click = (ctx, selector) => { const el = ctx.d.querySelector(selector); assert.ok(el, selector); el.click(); };
const fill = (ctx, selector, value) => { const el = ctx.d.querySelector(selector); el.value = value; el.dispatchEvent(new ctx.w.Event('input', { bubbles: true })); };
const submit = (ctx, selector) => ctx.d.querySelector(selector).dispatchEvent(new ctx.w.Event('submit', { bubbles: true, cancelable: true }));
const imageNodes = doc => {
  const images = [];
  (function collect(node) { if (node?.type === 'image') images.push(node); (node?.content || []).forEach(collect); })(doc);
  return images;
};
const documentTextNodes = doc => {
  const texts = [];
  (function collect(node) { if (node?.type === 'text') texts.push(node); (node?.content || []).forEach(collect); })(doc);
  return texts;
};
const paste = (ctx, { files = [], items = [], html = '', text = '' }) => {
  const event = new ctx.w.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files, items, getData: type => type === 'text/html' ? html : type === 'text/plain' ? text : '' } });
  ctx.d.querySelector('#editor [contenteditable="true"]').dispatchEvent(event);
};

test('JSON plain text and image protocol boundaries', () => {
  const notes = sampleNotes('./assets/');
  assert.match(plainText(notes[0].content), /흩어져 있던 생각/);
  assert.equal(safeImage('javascript:alert(1)'), '');
  assert.equal(safeImage('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(safeImage('//tracker.test/photo.png'), '');
  assert.equal(safeImage('./assets/river.png'), './assets/river.png');
  assert.deepEqual(normalizeImageAttrs({ alt: false, caption: null, width: '20px', height: 180 }, '/memo-media/00000000-0000-0000-0000-000000000001/'), {
    alignment: 'center', alt: '', caption: '', linkUrl: null, width: '100%', height: null, title: null, src: '/memo-media/00000000-0000-0000-0000-000000000001/',
  });
  assert.equal(normalizeDestinationURL('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.equal(normalizeDestinationURL('https://user@example.com/path'), '');
  assert.equal(normalizeYouTubeURL('https://youtu.be/7mQwJhtotxM'), 'https://www.youtube.com/watch?v=7mQwJhtotxM');
  assert.equal(normalizeYouTubeURL('https://m.youtube.com/shorts/7mQwJhtotxM'), 'https://www.youtube.com/watch?v=7mQwJhtotxM');
  assert.equal(youtubeURLFromThumbnail('https://i.ytimg.com/vi_webp/7mQwJhtotxM/hq720.webp'), 'https://www.youtube.com/watch?v=7mQwJhtotxM');
  assert.equal(normalizeYouTubeURL('javascript:alert(1)'), '');
  assert.equal(normalizeYouTubeURL('https://youtube.com.evil.example/watch?v=7mQwJhtotxM'), '');
});

test('demo adapter atomically checks revision and rejects concurrent overwrite', async () => {
  globalThis.indexedDB = new IDBFactory();
  const a = createAdapter({ mode: 'demo', storageKey: 'conflict', assetBase: './assets/' });
  await a.init();
  const first = (await a.list())[0], second = structuredClone(first);
  const saved = await a.save({ ...first, title: '첫 번째 변경' });
  assert.equal(saved.revision, first.revision + 1);
  await assert.rejects(() => a.save({ ...second, title: '덮어쓰기 시도' }), e => e.code === 'conflict');
  assert.equal((await a.list()).find(n => n.id === first.id).title, '첫 번째 변경');
  a.close();
});

test('application: creation, genuine Tiptap formatting, save/reload, metadata, search, read, trash/restore', async () => {
  const db = new IDBFactory(); let ctx = await boot(db);
  try {
    assert.match(ctx.d.querySelector('#save-status').textContent, /이 기기에 저장됨/);
    assert.equal(ctx.d.querySelectorAll('#outline button').length, 2);
    assert.equal(ctx.d.querySelectorAll('#editor figure img').length, 1);
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '');
    fill(ctx, '#document-title', '테스트: 한글 메모');
    const body = ctx.d.querySelector('#editor [contenteditable="true"]');
    body.focus();
    // Use the editor DOM transaction bridge through an actual key event.
    body.dispatchEvent(new ctx.w.KeyboardEvent('keydown', { key: '/', code: 'Slash', bubbles: true, cancelable: true }));
    await waitFor(() => ctx.d.querySelector('#insert-dialog').open, 'slash menu');
    click(ctx, '[data-insert="taskList"]');
    assert.equal(ctx.w.SmartMemo.getSnapshot().content.content[0].type, 'taskList');
    click(ctx, '[data-command="undo"]');
    assert.equal(ctx.w.SmartMemo.getSnapshot().content.content[0].type, 'paragraph');
    click(ctx, '[data-command="redo"]');
    assert.equal(ctx.w.SmartMemo.getSnapshot().content.content[0].type, 'taskList');
    // State comes from the genuine ProseMirror view attached to this DOM.
    const pm = ctx.d.querySelector('#editor .tiptap').editor.view;
    pm.dispatch(pm.state.tr.insertText('한글 입력과 저장 확인'));
    let from = 0, to = 0;
    pm.state.doc.descendants((node, pos) => { if (node.isText && !to) { from = pos; to = pos + node.nodeSize; } });
    const { TextSelection } = await import('@tiptap/pm/state');
    pm.dispatch(pm.state.tr.setSelection(TextSelection.create(pm.state.doc, from, to)));
    click(ctx, '[data-command="bold"]');
    assert.match(ctx.d.querySelector('#editor').innerHTML, /<strong>/);
    click(ctx, '#line-height-button'); click(ctx, '[data-line-height="2"]');
    // 줄간격은 이제 텍스트 마크가 아니라 문단/제목 블록 속성이다.
    const blocks = []; (function collect(node) { if (['paragraph', 'heading'].includes(node?.type)) blocks.push(node); (node?.content || []).forEach(collect); })(ctx.w.SmartMemo.getSnapshot().content);
    assert.ok(blocks.some(node => node.attrs?.lineHeight === '2'));
    click(ctx, '[data-action="tags"]');
    await waitFor(() => ctx.d.querySelector('#tags-dialog').open);
    fill(ctx, '#tags-input', '검증, 한글, 검증'); submit(ctx, '#tags-form');
    assert.deepEqual(Array.from(ctx.w.SmartMemo.getSnapshot().tags), ['검증', '한글']);
    assert.equal(await ctx.w.SmartMemo.flush(), true);
    const id = ctx.w.SmartMemo.getSnapshot().id;
    click(ctx, '[data-action="read"]');
    await waitFor(() => !ctx.d.querySelector('#reader-view').hidden);
    assert.equal(ctx.d.querySelector('#reader-title').textContent, '테스트: 한글 메모');
    assert.match(ctx.d.querySelector('#reader-content').innerHTML, /<strong>/);
    click(ctx, '[data-action="back-blog"]');
    await waitFor(() => !ctx.d.querySelector('#blog-view').hidden);
    fill(ctx, '#blog-search', '한글 입력');
    assert.equal(ctx.d.querySelectorAll('.note-card').length, 1);
    click(ctx, `.card-open[data-note="${id}"]`);
    await waitFor(() => !ctx.d.querySelector('#reader-view').hidden);
    click(ctx, '[data-action="delete"]');
    await waitFor(() => ctx.d.querySelector('#confirm-dialog').open);
    click(ctx, '#confirm-accept');
    await waitFor(() => !ctx.d.querySelector('#blog-view').hidden);
    assert.equal(ctx.d.querySelectorAll('.note-card').length, 0);
    click(ctx, '[data-filter="trash"]');
    await waitFor(() => ctx.d.querySelector('[data-restore]'));
    click(ctx, '[data-restore]');
    await waitFor(() => ctx.d.querySelectorAll('.note-card').length === 0);
    assert.equal(ctx.errors.length, 0, ctx.errors.join('\n'));
    ctx.close(); ctx = await boot(db);
    click(ctx, '[data-view="blog"]');
    await waitFor(() => !ctx.d.querySelector('#blog-view').hidden);
    fill(ctx, '#blog-search', '테스트: 한글 메모');
    assert.equal(ctx.d.querySelectorAll('.note-card').length, 1, 'persisted after reopening');
    click(ctx, `.card-open[data-note="${id}"]`);
    await waitFor(() => !ctx.d.querySelector('#reader-view').hidden);
    assert.match(ctx.d.querySelector('#reader-content').innerHTML, /<strong>/);
    assert.equal(ctx.errors.length, 0, ctx.errors.join('\n'));
  } finally { ctx.close(); }
});

test('replaceTextMarker replaces marker with image node', async () => {
  const ctx = await boot(new IDBFactory(), 'replaceMarkerTest');
  try {
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '', 'title ready');
    const marker = '⟦이미지 가져오기 대기 1⟧';
    // Insert marker as plain text
    paste(ctx, { text: marker });
    // Ensure marker appears in editor
    await waitFor(() => ctx.d.querySelector('#editor').textContent.includes(marker));
    // Prepare dummy image node
    const image = { type: 'image', attrs: { src: 'data:image/png;base64,AAA', alt: '', linkUrl: '' } };
    ctx.w.SmartMemo.replaceTextMarker(marker, image);
    // Wait for replacement
    await waitFor(() => !ctx.d.querySelector('#editor').textContent.includes(marker));
    // Verify image node exists
    const images = imageNodes(ctx.w.SmartMemo.getSnapshot().content);
    assert.equal(images.length, 1);
  } finally {
    ctx.close();
  }
});

test('browser HTML paste uses the editor transaction pipeline and preserves supported marks', async () => {
  const ctx = await boot(new IDBFactory(), 'html-paste-test');
  try {
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '', 'title ready');
    paste(ctx, { html: '<p><em>기울임</em> <s>취소선</s> <code>코드</code></p>', text: '기울임 취소선 코드' });
    await waitFor(() => ctx.d.querySelector('#editor').textContent.includes('기울임'), 'pasted text');
    const marks = documentTextNodes(ctx.w.SmartMemo.getSnapshot().content).flatMap(node => node.marks || []).map(mark => mark.type);
    assert.ok(marks.includes('italic'));
    assert.ok(marks.includes('strike'));
    assert.ok(marks.includes('code'));
    assert.equal(await ctx.w.SmartMemo.flush(), true);
    assert.equal(ctx.errors.length, 0, ctx.errors.join('\n'));
  } finally {
    ctx.close();
  }
});

test('application: table, image metadata, safe dialogs, blank search and new notebook', async () => {
  const ctx = await boot(new IDBFactory(), 'table-test');
  try {
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '');
    const pm = ctx.d.querySelector('#editor .tiptap').editor.view;
    pm.focus(); click(ctx, '[data-action="insert"]');
    await waitFor(() => ctx.d.querySelector('#insert-dialog').open);
    click(ctx, '[data-insert="table"]');
    assert.equal(ctx.d.querySelectorAll('#editor table tr').length, 3);
    const file = new ctx.w.File([Uint8Array.from([137,80,78,71])], 'sample.png', { type: 'image/png' });
    Object.defineProperty(ctx.d.querySelector('#image-file'), 'files', { configurable: true, value: [file] });
    ctx.d.querySelector('#image-file').dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
    await waitFor(() => ctx.d.querySelector('#image-dialog').open, 'image dialog');
    fill(ctx, '#image-alt', '대체 설명'); fill(ctx, '#image-caption', '사진에 남긴 한 줄');
    submit(ctx, '#image-form');
    assert.equal(ctx.d.querySelector('#editor figure img').getAttribute('alt'), '대체 설명');
    assert.equal(ctx.d.querySelector('#editor figcaption').textContent, '사진에 남긴 한 줄');
    const imageBlock = ctx.d.querySelector('#editor figure[data-memo-image]');
    imageBlock.click();
    assert.ok(imageBlock.classList.contains('is-selected'));
    assert.ok(imageBlock.querySelector('.memo-image-toolbar').checkVisibility ? !imageBlock.querySelector('.memo-image-toolbar').checkVisibility() : !imageBlock.classList.contains('is-editing'));
    assert.equal(ctx.d.querySelector('#image-edit-button').disabled, false);
    click(ctx, '#image-edit-button'); await delay(0);
    assert.ok(imageBlock.classList.contains('is-editing'));
    click(ctx, '#image-edit-button'); await delay(0);
    assert.equal(imageBlock.classList.contains('is-editing'), false);
    click(ctx, '#image-edit-button'); await delay(0);
    assert.ok(imageBlock.classList.contains('is-editing'));
    const caption = imageBlock.querySelector('.memo-image-caption');
    caption.dispatchEvent(new ctx.w.CompositionEvent('compositionstart', { bubbles: true, data: '한' }));
    caption.textContent = '한글 캡션 수정';
    caption.dispatchEvent(new ctx.w.Event('input', { bubbles: true }));
    caption.dispatchEvent(new ctx.w.CompositionEvent('compositionend', { bubbles: true, data: '글' }));
    click(ctx, '[data-image-action="align-right"]');
    fill(ctx, '.memo-image-toolbar input[type="number"]', '420');
    ctx.d.querySelector('.memo-image-toolbar input[type="number"]').dispatchEvent(new ctx.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(imageBlock.classList.contains('is-editing'), false);
    click(ctx, '#image-edit-button'); await delay(0);
    click(ctx, '[data-image-action="link"]');
    fill(ctx, '.memo-image-link-popover input', 'https://example.com/video?q=1');
    submit(ctx, '.memo-image-link-popover');
    let imageJSON = imageNodes(ctx.w.SmartMemo.getSnapshot().content)[0];
    assert.deepEqual({ caption: imageJSON.attrs.caption, alignment: imageJSON.attrs.alignment, width: imageJSON.attrs.width, linkUrl: imageJSON.attrs.linkUrl }, {
      caption: '한글 캡션 수정', alignment: 'right', width: 420, linkUrl: 'https://example.com/video?q=1',
    });
    imageBlock.click(); click(ctx, '[data-image-action="link"]'); click(ctx, '.memo-image-link-popover button[type="button"]');
    assert.equal(imageNodes(ctx.w.SmartMemo.getSnapshot().content)[0].attrs.linkUrl, null);
    imageBlock.click(); click(ctx, '[data-image-action="link"]'); fill(ctx, '.memo-image-link-popover input', 'https://example.com/video?q=1'); submit(ctx, '.memo-image-link-popover');
    imageJSON = imageNodes(ctx.w.SmartMemo.getSnapshot().content)[0];
    const instance = ctx.d.querySelector('#editor .tiptap').editor;
    instance.commands.setTextSelection(instance.state.doc.content.size);
    instance.commands.insertContent(imageJSON);
    const copies = imageNodes(ctx.w.SmartMemo.getSnapshot().content);
    assert.equal(copies.length, 2);
    assert.deepEqual(copies[1].attrs, copies[0].attrs, 'duplicated image keeps block metadata');
    click(ctx, '[data-action="metadata"]');
    const privateToggle = ctx.d.querySelector('#meta-private');
    assert.equal(privateToggle.checked, true, 'new notes default to private');
    privateToggle.checked = false; privateToggle.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
    assert.equal(ctx.d.querySelector('#visibility-help').textContent, '누구나 이 글을 볼 수 있습니다.');
    submit(ctx, '#metadata-form');
    assert.equal(ctx.w.SmartMemo.getSnapshot().is_public, false, 'visibility waits for explicit save');
    assert.equal(ctx.d.querySelector('#info-visibility').textContent, '전체 공개 · 저장 전');
    const visibility = ctx.d.querySelector('#visibility-select'); visibility.value = 'private'; visibility.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
    click(ctx, '[data-action="add-notebook"]');
    await waitFor(() => ctx.d.querySelector('#notebook-dialog').open);
    fill(ctx, '#notebook-name', '<script>개인</script>'); submit(ctx, '#notebook-form');
    await waitFor(() => !ctx.d.querySelector('#notebook-dialog').open);
    assert.match(ctx.d.querySelector('#notebook-list').textContent, /<script>개인<\/script>/);
    assert.equal(ctx.d.querySelectorAll('#notebook-list script').length, 0, 'notebook labels escaped');
    assert.equal(await ctx.w.SmartMemo.flush(), true);
    click(ctx, '[data-action="read"]');
    await waitFor(() => !ctx.d.querySelector('#reader-view').hidden);
    const linkedImage = ctx.d.querySelector('#reader-content a[href="https://example.com/video?q=1"]');
    assert.ok(linkedImage);
    assert.equal(linkedImage.getAttribute('target'), '_blank');
    assert.equal(ctx.d.querySelector('#reader-content figure').dataset.align, 'right');
    click(ctx, '[data-action="edit"]');
    await waitFor(() => !ctx.d.querySelector('#editor-view').hidden);
    click(ctx, '[data-action="search"]');
    await waitFor(() => !ctx.d.querySelector('#blog-view').hidden);
    fill(ctx, '#blog-search', '존재하지않는검색어');
    assert.equal(ctx.d.querySelectorAll('.note-card').length, 0);
    assert.ok(ctx.d.querySelector('.empty-state'));
    assert.equal(ctx.errors.length, 0, ctx.errors.join('\n'));
  } finally { ctx.close(); }
});

test('application keeps current edits and blocks navigation on revision conflict', async () => {
  const db = new IDBFactory(); const ctx = await boot(db, 'ui-conflict');
  globalThis.indexedDB = db;
  const other = createAdapter({ mode: 'demo', storageKey: 'ui-conflict', assetBase: './assets/' });
  try {
    await other.init();
    const original = (await other.list()).find(n => n.id === ctx.w.SmartMemo.getSnapshot().id);
    await other.save({ ...original, title: '다른 탭의 최신 내용' });
    fill(ctx, '#document-title', '화면에 유지할 나의 초안');
    const visibility = ctx.d.querySelector('#visibility-select'); visibility.value = 'public'; visibility.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
    click(ctx, '[data-action="save"]');
    await waitFor(() => ctx.d.querySelector('#save-status').dataset.state === 'conflict');
    assert.equal(ctx.d.querySelector('#document-title').value, '화면에 유지할 나의 초안');
    assert.equal(ctx.d.querySelector('#save-status').dataset.state, 'conflict');
    assert.equal(ctx.d.querySelector('#conflict-export').hidden, false);
    assert.equal(ctx.w.SmartMemo.getSnapshot().is_public, false);
    assert.equal(ctx.d.querySelector('#footer-visibility').textContent, '전체 공개 · 저장 전');
    click(ctx, '[data-view="blog"]');
    await delay(120);
    assert.equal(ctx.d.querySelector('#editor-view').hidden, false, 'must not navigate after failed save');
    assert.equal((await other.list()).find(n => n.id === original.id).title, '다른 탭의 최신 내용');
  } finally { other.close(); ctx.close(); }
});

test('explicit save opens the updated blog, while autosave and shortcut stay in editor', async () => {
  const ctx = await boot(new IDBFactory(), 'save-navigation');
  try {
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '');
    fill(ctx, '#document-title', '자동 저장 뒤 화면 유지');
    await waitFor(() => ctx.d.querySelector('#save-status').dataset.state === 'saved');
    assert.equal(ctx.d.querySelector('#editor-view').hidden, false, 'autosave stays in editor');
    fill(ctx, '#document-title', '단축키 저장 뒤 화면 유지');
    ctx.d.dispatchEvent(new ctx.w.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await waitFor(() => ctx.d.querySelector('#save-status').dataset.state === 'saved');
    assert.equal(ctx.d.querySelector('#editor-view').hidden, false, 'shortcut stays in editor');
    fill(ctx, '#document-title', '저장 버튼 완료 기록');
    click(ctx, '[data-action="save"]');
    await waitFor(() => !ctx.d.querySelector('#blog-view').hidden);
    assert.match(ctx.d.querySelector('#blog-feed').textContent, /저장 버튼 완료 기록/);
    assert.equal(ctx.errors.length, 0, ctx.errors.join('\n'));
  } finally { ctx.close(); }
});

test('visibility changes are staged until explicit save and can be restored to private', async () => {
  const ctx = await boot(new IDBFactory(), 'visibility-save');
  try {
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '');
    fill(ctx, '#document-title', '공개 범위 저장 테스트');
    await waitFor(() => ctx.d.querySelector('#save-status').dataset.state === 'saved');
    const visibility = ctx.d.querySelector('#visibility-select');
    assert.equal(visibility.value, 'private');
    visibility.value = 'public'; visibility.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
    assert.equal(ctx.d.querySelector('#visibility-warning').hidden, false);
    assert.equal(ctx.d.querySelector('#footer-visibility').textContent, '전체 공개 · 저장 전');
    await delay(1800);
    assert.equal(ctx.w.SmartMemo.getSnapshot().is_public, false, 'autosave must not publish');
    const id = ctx.w.SmartMemo.getSnapshot().id;
    click(ctx, '[data-action="save"]');
    await waitFor(() => !ctx.d.querySelector('#blog-view').hidden);
    assert.match(ctx.d.querySelector('#blog-feed').textContent, /공개 범위 저장 테스트[\s\S]*공개/);
    click(ctx, `.card-open[data-note="${id}"]`); await waitFor(() => !ctx.d.querySelector('#reader-view').hidden); click(ctx, '[data-action="edit"]');
    await waitFor(() => !ctx.d.querySelector('#editor-view').hidden);
    assert.equal(ctx.d.querySelector('#visibility-select').value, 'public');
    visibility.value = 'private'; visibility.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
    fill(ctx, '#document-title', '다시 비공개 저장');
    await waitFor(() => ctx.d.querySelector('#save-status').dataset.state === 'saved');
    assert.equal(ctx.w.SmartMemo.getSnapshot().is_public, true, 'autosave keeps last saved public state');
    click(ctx, '[data-action="save"]'); await waitFor(() => !ctx.d.querySelector('#blog-view').hidden);
    assert.match(ctx.d.querySelector('#blog-feed').textContent, /다시 비공개 저장[\s\S]*나만 보기/);
  } finally { ctx.close(); }
});

test('integration configuration fails closed instead of falling back to demo', () => {
  assert.throws(() => createAdapter({ mode: 'django' }), e => e.code === 'configuration');
  assert.throws(() => createAdapter({}), e => e.code === 'configuration');
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(newDocument().type, 'doc');
});

test('external HTML and plain text paste use explicit white text without highlights', async () => {
  const database = new IDBFactory(); let ctx = await boot(database, 'white-paste');
  try {
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '');
    const root = ctx.d.querySelector('#editor .tiptap');
    root.editor.commands.focus('start');
    paste(ctx, { html: '<h2 style="color:#000;background:#ff0">검정 제목</h2><ul><li><strong style="color:red">굵은 글</strong></li></ul><table><tbody><tr><td><mark><a href="https://example.com" style="color:green;background:blue">표 링크</a></mark></td></tr></tbody></table>', text: '검정 제목 굵은 글 표 링크' });
    await waitFor(() => /표 링크/.test(ctx.d.querySelector('#editor').textContent), 'HTML paste');
    assert.equal(ctx.d.querySelectorAll('#editor h2').length, 1);
    assert.equal(ctx.d.querySelectorAll('#editor table').length, 1);
    assert.equal(ctx.d.querySelector('#editor a')?.getAttribute('href'), 'https://example.com');
    assert.equal(ctx.d.querySelectorAll('#editor mark').length, 0);
    root.editor.chain().focus('end').setColor('#ff0000').run();
    paste(ctx, { text: '활성 색상 뒤의 일반 텍스트' });
    await waitFor(() => /일반 텍스트/.test(ctx.d.querySelector('#editor').textContent), 'plain text paste');
    const textNodes = [];
    root.editor.getJSON().content.forEach(function collect(node) { if (node.type === 'text') textNodes.push(node); (node.content || []).forEach(collect); });
    const pasted = textNodes.filter(node => /검정 제목|굵은 글|표 링크|활성 색상/.test(node.text));
    assert.equal(pasted.length, 4);
    pasted.forEach(node => {
      const style = node.marks?.find(mark => mark.type === 'textStyle');
      assert.equal(style?.attrs.color, '#ffffff');
      assert.ok(!style?.attrs.backgroundColor);
      assert.ok(!node.marks?.some(mark => mark.type === 'highlight'));
    });
    assert.ok(textNodes.find(node => node.text === '굵은 글').marks.some(mark => mark.type === 'bold'));
    assert.equal(await ctx.w.SmartMemo.flush(), true);
    const savedId = ctx.w.SmartMemo.getSnapshot().id;
    ctx.close(); ctx = await boot(database, 'white-paste');
    assert.equal(ctx.w.SmartMemo.getSnapshot().id, savedId);
    const reloadedText = [];
    ctx.w.SmartMemo.getSnapshot().content.content.forEach(function collect(node) { if (node.type === 'text') reloadedText.push(node); (node.content || []).forEach(collect); });
    reloadedText.filter(node => /검정 제목|굵은 글|표 링크|활성 색상/.test(node.text)).forEach(node => {
      assert.equal(node.marks?.find(mark => mark.type === 'textStyle')?.attrs.color, '#ffffff');
    });
  } finally { ctx.close(); }
});

test('clipboard screenshot files upload once from items or files and handle failure or deletion', async () => {
  const ctx = await boot(new IDBFactory(), 'screenshot-paste');
  try {
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '');
    const png = name => new ctx.w.File([Uint8Array.from([137, 80, 78, 71])], name, { type: 'image/png' });
    const asItem = file => ({ kind: 'file', type: file.type, getAsFile: () => file });

    const itemOnly = png('screenshot.png'); paste(ctx, { items: [asItem(itemOnly)] });
    await waitFor(() => imageNodes(ctx.w.SmartMemo.getSnapshot().content).length === 1, 'items-only image');
    const filesOnly = png('capture.png'); paste(ctx, { files: [filesOnly] });
    await waitFor(() => imageNodes(ctx.w.SmartMemo.getSnapshot().content).length === 2, 'files-only image');
    const nameless = png(''); paste(ctx, { items: [asItem(nameless)] });
    await waitFor(() => imageNodes(ctx.w.SmartMemo.getSnapshot().content).length === 3, 'nameless image');
    const duplicate = png('duplicate.png'); paste(ctx, { files: [duplicate], items: [asItem(duplicate)] });
    await waitFor(() => imageNodes(ctx.w.SmartMemo.getSnapshot().content).length === 4, 'deduplicated image');
    assert.equal(imageNodes(ctx.w.SmartMemo.getSnapshot().content).length, 4);

    const oversized = png('too-large.png'); Object.defineProperty(oversized, 'size', { value: 6 * 1024 * 1024 });
    paste(ctx, { items: [asItem(oversized)] });
    await waitFor(() => /이미지 가져오기 실패/.test(ctx.d.querySelector('#editor').textContent), 'failure message');
    assert.equal(ctx.d.querySelector('#image-import-retry').hidden, false);
    assert.doesNotMatch(ctx.d.querySelector('#editor').textContent, /이미지 가져오기 대기/);

    const OriginalReader = ctx.w.FileReader;
    ctx.w.FileReader = class extends OriginalReader { readAsDataURL(blob) { setTimeout(() => super.readAsDataURL(blob), 120); } };
    paste(ctx, { items: [asItem(png('deleted.png'))] });
    await waitFor(() => /이미지 가져오기 대기/.test(ctx.d.querySelector('#editor').textContent), 'pending image marker');
    const instance = ctx.d.querySelector('#editor .tiptap').editor; let waiting = null;
    instance.state.doc.descendants((node, pos) => { const index = node.isText ? node.text.indexOf('⟦이미지 가져오기 대기') : -1; if (index >= 0) waiting = { from: pos + index, to: pos + node.text.indexOf('⟧', index) + 1 }; });
    assert.ok(waiting); instance.commands.deleteRange(waiting);
    await delay(250); ctx.w.FileReader = OriginalReader;
    assert.equal(imageNodes(ctx.w.SmartMemo.getSnapshot().content).length, 4);
    assert.doesNotMatch(ctx.d.querySelector('#editor').textContent, /이미지 가져오기 대기/);
  } finally { ctx.close(); }
});

test('paste prefers an image file, imports HTML images once, and preserves safe structure', async () => {
  const ctx = await boot(new IDBFactory(), 'paste-images');
  try {
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '');
    const file = new ctx.w.File([Uint8Array.from([137, 80, 78, 71])], 'clipboard.png', { type: 'image/png' });
    paste(ctx, { files: [file], html: '<a href="https://youtu.be/abcdefghijk"><img src="https://i.ytimg.com/vi/abcdefghijk/hq720.jpg"></a>' });
    await waitFor(() => ctx.d.querySelectorAll('#editor figure img').length === 1);
    assert.equal(ctx.d.querySelectorAll('#editor figure img').length, 1, 'file and HTML must not duplicate the image');
    assert.equal(ctx.w.SmartMemo.getSnapshot().content.content.find(n => n.type === 'image').attrs.linkUrl, 'https://www.youtube.com/watch?v=abcdefghijk');
    assert.equal(ctx.d.querySelector('#editor figure').closest('a'), null, 'editor image must not open the video');

    ctx.w.fetch = async () => ({ ok: true, blob: async () => new ctx.w.Blob([Uint8Array.from([255, 216, 255, 217])], { type: 'image/jpeg' }) });
    paste(ctx, { html: '<p onclick="bad()" style="color:red">일반 글 <a href="https://example.com" style="x">안전 링크</a></p><table><tbody><tr><td>표</td></tr></tbody></table><img src="https://i.ytimg.com/vi/ZYXWVutsrqp/hq720.jpg" onerror="bad()"><a href="https://www.youtube.com/shorts/1234567890_"><img src="https://i.ytimg.com/vi/1234567890_/hq720.jpg"></a>' });
    await delay(500);
    assert.equal(ctx.d.querySelectorAll('#editor figure img').length, 3, `${ctx.d.querySelector('#save-status').textContent} / ${ctx.d.querySelector('#toast').textContent}`);
    assert.match(ctx.d.querySelector('#editor').textContent, /일반 글/);
    assert.equal(ctx.d.querySelectorAll('#editor table').length, 1);
    assert.equal(ctx.d.querySelector('#editor a')?.getAttribute('href'), 'https://example.com');
    assert.equal(ctx.d.querySelectorAll('#editor [onclick], #editor [onerror], #editor p[style]').length, 0);
    const imageLinks = [];
    (function collect(node) { if (node?.type === 'image') imageLinks.push(node.attrs.linkUrl); (node?.content || []).forEach(collect); })(ctx.w.SmartMemo.getSnapshot().content);
    assert.deepEqual(Array.from(imageLinks), [
      'https://www.youtube.com/watch?v=abcdefghijk',
      'https://www.youtube.com/watch?v=ZYXWVutsrqp',
      'https://www.youtube.com/watch?v=1234567890_',
    ]);
    paste(ctx, { html: '<p>&lt;yt-image&gt;</p><a href="https://youtu.be/a1B2c3D4e5F"><img src="https://i.ytimg.com/vi/a1B2c3D4e5F/hq720.jpg" alt="thumbnail"></a><p>&lt;/yt-image&gt;</p>' });
    await waitFor(() => ctx.d.querySelectorAll('#editor figure img').length === 4, 'yt-image thumbnail import');
    assert.doesNotMatch(ctx.d.querySelector('#editor').textContent, /<\/?yt-image>/i);
    const pastedImage = imageNodes(ctx.w.SmartMemo.getSnapshot().content).at(-1);
    assert.deepEqual({ caption: pastedImage.attrs.caption, width: pastedImage.attrs.width, alignment: pastedImage.attrs.alignment, linkUrl: pastedImage.attrs.linkUrl }, {
      caption: '', width: '100%', alignment: 'center', linkUrl: 'https://www.youtube.com/watch?v=a1B2c3D4e5F',
    });
    assert.equal(await ctx.w.SmartMemo.flush(), true);
    click(ctx, '[data-action="read"]');
    await waitFor(() => !ctx.d.querySelector('#reader-view').hidden);
    const readerLink = ctx.d.querySelector('#reader-content a[href*="youtube.com/watch"]');
    assert.ok(readerLink);
    assert.equal(readerLink.getAttribute('target'), '_blank');
    assert.equal(readerLink.getAttribute('rel'), 'noopener noreferrer');
    click(ctx, '[data-action="back-blog"]');
    await waitFor(() => !ctx.d.querySelector('#blog-view').hidden);
    assert.ok(ctx.d.querySelector('.card-media-link[href*="youtube.com/watch"]'));
  } finally { ctx.close(); }
});

test('standalone preview embeds exactly the built code without replacement-string corruption', () => {
  const html = readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
  const file = readdirSync(new URL('../dist/assets', import.meta.url)).find(name => name.endsWith('.js'));
  const source = readFileSync(new URL(`../dist/assets/${file}`, import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  assert.equal(inline[0][1], source.replace(/<\/script/gi, '<\\/script'));
  assert.match(html, /\.\/assets\/favicon\.svg/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});

test('voice dictation inserts spoken text and camera input is wired for photos', async () => {
  const ctx = await boot(new IDBFactory(), 'voiceCameraTest');
  try {
    const camera = ctx.d.querySelector('#camera-file');
    assert.equal(camera.getAttribute('capture'), 'environment');
    assert.match(camera.accept, /image/);
    let started = 0, instance = null;
    ctx.w.SpeechRecognition = class { constructor() { instance = this; } start() { started++; } stop() { this.stopped = true; } };
    click(ctx, '[data-action="new"]');
    await waitFor(() => ctx.d.querySelector('#document-title').value === '', 'new note ready');
    ctx.d.querySelector('#editor [contenteditable="true"]').focus();
    click(ctx, '[data-action="voice"]');
    await delay(0);
    assert.equal(started, 1);
    assert.equal(instance.lang, 'ko-KR');
    assert.equal(ctx.d.querySelector('[data-action="voice"]').getAttribute('aria-pressed'), 'true');
    const part = (text, isFinal) => Object.assign([{ transcript: text }], { isFinal });
    instance.onresult({ resultIndex: 0, results: [part('음성으로 쓴 문장', true)] });
    await waitFor(() => ctx.d.querySelector('#editor').textContent.includes('음성으로 쓴 문장'), 'spoken text inserted');
    instance.onerror({ error: 'not-allowed' });
    assert.equal(ctx.d.querySelector('[data-action="voice"]').getAttribute('aria-pressed'), 'false');
    assert.equal(ctx.errors.length, 0, ctx.errors.join('\n'));
  } finally { ctx.close(); }
});
