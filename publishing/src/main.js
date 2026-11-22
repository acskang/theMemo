import './styles.css';
import './link-styles.css';
import './image-node.css';
import './user-menu.css';
import './user-menu.js';
import './visibility.css';
import Alpine from 'alpinejs';
import htmx from 'htmx.org';
import { createIcons, Mic, Camera, NotebookPen, PanelLeft, Search, Plus, CalendarDays, Files, Star, Folder, FolderOpen, Trash2, Settings2, LockKeyhole, Maximize2, Eye, Undo2, Redo2, Highlighter, AlignLeft, List, ListTodo, Link, ChevronDown, PanelRight, ImagePlus, Smile, X, Clock3, LayoutList, ArrowLeft, Download, SquarePen, BookOpenText, Image, Quote, Minus, Code, Table, ArrowUp, ArrowDown, Rows3, Columns3, Check, FileText, Inbox, Paperclip, Combine, Images, Minimize2, MoveHorizontal, TableProperties } from 'lucide';
import { createAdapter } from './adapters.js';
import { downscaleImage, speechCtor, finalTranscript, speechErrorMessage } from './capture.js';
import { createMemoEditor, plainText, findImageInfo, safeImage, normalizeImageAttrs, normalizeYouTubeURL, youtubeURLFromThumbnail, moveBlock, normalizeBlockLineHeight, selectedBlockLineHeight, setBlockLineHeight } from './editor.js';
import { CellSelection, TableMap, selectedRect } from '@tiptap/pm/tables';
import { loadConfig, ConfigStore } from './configLoader.js';
import { localDate, newDocument, p } from './sample-data.js';
import { createMasonry } from './masonry.js';
import { hasDuplicateNotebookName, normalizeNotebookName } from './notebook-name.js';

const iconSet = { Mic, Camera, NotebookPen, PanelLeft, Search, Plus, CalendarDays, Files, Star, Folder, FolderOpen, Trash2, Settings2, LockKeyhole, Maximize2, Eye, Undo2, Redo2, Highlighter, AlignLeft, List, ListTodo, Link, ChevronDown, PanelRight, ImagePlus, Smile, X, Clock3, LayoutList, ArrowLeft, Download, SquarePen, BookOpenText, Image, Quote, Minus, Code, Table, ArrowUp, ArrowDown, Rows3, Columns3, Check, FileText, Inbox, Paperclip, Combine, Images, Minimize2, MoveHorizontal, TableProperties };
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const refreshIcons = () => createIcons({ icons: iconSet, attrs: { 'aria-hidden': 'true' } });
const clone = data => structuredClone(data);
const time = iso => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const readableDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const ui = () => Alpine.store('ui');
const query = new URLSearchParams(location.search);
let config; let adapter; let editor; let readerEditor; let notes = []; let notebooks = [];
let current = null; let view = 'editor'; let filter = 'all'; let notebookFilter = ''; let tagFilter = '';
let editVersion = 0, persistedVersion = 0, savePromise = null, timer = null, toastTimer = null;
let loading = false, composing = false, imagePurpose = 'body', pendingImage = null, bookmark = null;
let saveError = null, blogScroll = 0, channel = null, disposed = false;
let pasteImageSequence = 0;
let selectedPublic = false, savedPublic = false;
let blogCards = [], blogCursor = null, blogCardsLoading = false, blogPageStarted = false, blogRequest = 0, blogMasonry = null;
let blogSearchTimer = null;
let editingNotebookId = null;
const pendingImageImports = new Set();
const failedImageImports = new Map();
let prefs = { bodySize: '17', autosave: true }; let activeFilterLabel = '전체 기록';
const shortcutActions = [
  ['save', '저장'], ['search', '전체 검색'], ['link', '본문 링크'], ['bold', '굵게'], ['italic', '기울임'], ['underline', '밑줄'],
  ['strike', '취소선'], ['undo', '실행 취소'], ['redo', '다시 실행'], ['alignLeft', '왼쪽 정렬'], ['alignCenter', '가운데 정렬'],
  ['alignRight', '오른쪽 정렬'], ['bulletList', '글머리 목록'], ['orderedList', '번호 목록'], ['taskList', '체크리스트'],
  ['blockquote', '인용문'], ['codeBlock', '코드 블록'], ['insert', '블록 삽입'],
];
const defaultShortcuts = [
  ['save','ctrl+s'],['search','ctrl+k'],['link','ctrl+shift+k'],['bold','ctrl+b'],['italic','ctrl+i'],['underline','ctrl+u'],['strike','ctrl+shift+x'],
  ['undo','ctrl+z'],['redo','ctrl+shift+z'],['alignLeft','ctrl+shift+l'],['alignCenter','ctrl+shift+e'],['alignRight','ctrl+shift+r'],
  ['bulletList','ctrl+shift+8'],['orderedList','ctrl+shift+7'],['taskList','ctrl+shift+9'],['blockquote','ctrl+shift+q'],['codeBlock','ctrl+shift+c'],['insert','/'],
].map(([action, key]) => ({ action, key }));
let shortcuts = defaultShortcuts;
const bubble = $('bubble-menu');

Alpine.store('ui', {
  focus: false, drawer: false, inspector: query.get('outline') === '1', mobile: innerWidth < 1024, keyboard: false,
  escape() {
    if (document.querySelector('dialog[open]')) return;
    if (this.drawer) this.drawer = false;
    else if (this.inspector) this.inspector = false;
    else this.focus = false;
  },
});
window.Alpine = Alpine; window.htmx = htmx;
// Only start Alpine when a <body> element is present.  In the test
// environment the document is a stub, so we skip starting to avoid errors.
if (document && document.body) {
  Alpine.start();
}

function imageNameApi() {
  if (!adapter || adapter.mode !== 'django') return null;
  return {
    load: id => adapter.imageInfo(id).then(data => data?.original_name ?? null),
    save: (id, name) => adapter.renameImage(id, name).then(data => data?.original_name ?? null),
  };
}

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}
function normalizeShortcut(value) {
  const parts = String(value || '').trim().toLowerCase().split('+').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const modifiers = new Set(parts.slice(0, -1));
  if ([...modifiers].some(item => !['ctrl', 'cmd', 'meta', 'alt', 'shift'].includes(item))) return null;
  const key = parts.at(-1);
  if (['ctrl', 'cmd', 'meta', 'alt', 'shift'].includes(key) || key.length > 1 && !/^f(?:[1-9]|1[0-2])$/.test(key)) return null;
  const normalized = [...['ctrl', 'alt', 'shift'].filter(item => modifiers.has(item)), key];
  return normalized.join('+');
}
function shortcutLabel(value) { return value.split('+').map(part => ({ ctrl: 'Ctrl / ⌘', cmd: 'Ctrl / ⌘', meta: 'Ctrl / ⌘', alt: 'Alt / ⌥', shift: 'Shift', '/': '/' }[part] || part.toUpperCase())).join(' + '); }
function saveShortcuts() { try { localStorage.setItem('smartmemo-shortcuts', JSON.stringify(shortcuts)); } catch { toast('단축키 설정을 저장하지 못했어요.'); } }
function renderShortcuts() {
  $('shortcut-help-list').innerHTML = shortcuts.map(item => {
    const label = shortcutActions.find(([id]) => id === item.action)?.[1] || item.action;
    return `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(shortcutLabel(item.key))}</dd></div>`;
  }).join('');
  $('shortcut-editor').innerHTML = shortcuts.map((item, index) => {
    const label = shortcutActions.find(([id]) => id === item.action)?.[1] || item.action;
    return `<div class="shortcut-edit-row"><span>${escapeHTML(label)}</span><input class="text-input" data-shortcut-index="${index}" value="${escapeHTML(shortcutLabel(item.key))}" aria-label="${escapeHTML(label)} 단축키"><button class="icon-button small danger" type="button" data-shortcut-remove="${index}" aria-label="${escapeHTML(label)} 단축키 제거">×</button></div>`;
  }).join('');
  $('shortcut-new-action').innerHTML = shortcutActions.filter(([id]) => !shortcuts.some(item => item.action === id)).map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
}
function eventShortcut(event) {
  if (!(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return null;
  const key = event.key.toLowerCase() === ' ' ? 'space' : event.key.toLowerCase();
  return [...(event.ctrlKey || event.metaKey ? ['ctrl'] : []), ...(event.altKey ? ['alt'] : []), ...(event.shiftKey ? ['shift'] : []), key].join('+');
}
function report(error) { console.error(error); toast(error.message || '작업을 완료하지 못했어요.'); }
function run(fn) { Promise.resolve().then(fn).catch(report); }
function savedStatus(state, message) { $('save-status').dataset.state = state; $('save-status').textContent = message; $('conflict-export').hidden = state !== 'conflict'; }
function isDirty() { return editVersion > persistedVersion; }
function notebookName(id) { return notebooks.find(n => n.id === id)?.name || '메모장'; }
function autoHeight() { const el = $('document-title'); el.style.height = 'auto'; el.style.height = `${Math.max(45, el.scrollHeight)}px`; }
function showDialog(id, input) { $(id).showModal(); if (input) requestAnimationFrame(() => $(input).focus()); }
function rememberSelection() { if (editor) bookmark = { from: editor.state.selection.from, to: editor.state.selection.to }; }
function restoreSelection() {
  if (!editor) return;
  if (bookmark) {
    const max = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: Math.min(bookmark.from, max), to: Math.min(bookmark.to, max) });
  }
  editor.commands.focus();
}
async function confirmAction(message, label = '확인') {
  $('confirm-message').textContent = message; $('confirm-accept').textContent = label;
  return new Promise(resolve => {
    const dialog = $('confirm-dialog');
    const settle = value => { cleanup(); dialog.close(); resolve(value); };
    const yes = () => settle(true), no = () => settle(false);
    const cancel = event => { event.preventDefault(); no(); };
    const cleanup = () => {
      $('confirm-accept').removeEventListener('click', yes); $('confirm-cancel').removeEventListener('click', no); dialog.removeEventListener('cancel', cancel);
    };
    $('confirm-accept').addEventListener('click', yes); $('confirm-cancel').addEventListener('click', no); dialog.addEventListener('cancel', cancel);
    dialog.showModal();
  });
}
function touch({ scheduleAutosave = true } = {}) {
  if (loading || !current) return;
  current.title = $('document-title').value;
  current.content = editor.getJSON(); current.plain_text = plainText(current.content);
  editVersion++; saveError = null; savedStatus('pending', '저장 대기');
  updateCount(); updateOutline(); clearTimeout(timer);
  if (scheduleAutosave && prefs.autosave && !composing) timer = setTimeout(() => run(saveCurrent), 1500);
}
async function saveCurrent() {
  clearTimeout(timer);
  if (pendingImageImports.size) {
    savedStatus('saving', '이미지를 가져오는 중…');
    await Promise.all([...pendingImageImports]);
  }
  if (failedImageImports.size || findExternalImageSources(editor?.getJSON()).length) {
    savedStatus('error', '이미지를 다시 가져온 뒤 저장해 주세요.');
    refreshImageRecovery();
    toast('가져오지 못한 이미지를 다시 시도해 주세요. 현재 내용은 유지됩니다.');
    return false;
  }
  if (savePromise) return savePromise;
  if (!current || !isDirty()) return true;
  if (composing) return false;
  savePromise = (async () => {
    while (current && isDirty()) {
      const version = editVersion, id = current.id, snapshot = clone(current);
      savedStatus('saving', adapter.mode === 'demo' ? '이 기기에 저장 중…' : '서버에 저장 중…');
      try {
        const saved = await adapter.save(snapshot);
        const index = notes.findIndex(n => n.id === saved.id);
        if (index < 0) notes.push(saved); else notes[index] = saved;
        if (current?.id === id) {
          current.revision = saved.revision; current.updated_at = saved.updated_at;
          persistedVersion = version;
          savedStatus('saved', `${adapter.mode === 'demo' ? '이 기기에 저장됨' : '서버 저장됨'} · ${time(saved.updated_at)}`);
          $('info-modified').textContent = time(saved.updated_at);
        }
        channel?.postMessage({ id: saved.id, revision: saved.revision });
        renderNavigation();
      } catch (error) {
        saveError = error;
        savedStatus(error.code === 'conflict' ? 'conflict' : 'error', error.code === 'conflict' ? '수정 충돌 · JSON 보관' : '저장 실패 · 다시 저장');
        toast(error.message); return false;
      }
    }
    return true;
  })();
  try { return await savePromise; } finally { savePromise = null; }
}
async function ensureSaved() {
  if (!isDirty()) return true;
  const success = await saveCurrent();
  if (!success) toast('저장이 끝나지 않아 이동하지 않았어요. 현재 내용을 유지하고 있어요.');
  return success;
}
async function saveInEditor() {
  const success = await saveCurrent();
  if (success) toast(adapter.mode === 'demo' ? '이 브라우저에 저장했어요.' : '서버에 저장했어요.');
  return success;
}
async function saveAndOpenBlog() {
  const previousPublic = current.is_public;
  if (selectedPublic !== savedPublic) { current.is_public = selectedPublic; touch({ scheduleAutosave: false }); }
  if (!(await saveInEditor())) { current.is_public = previousPublic; updateVisibilityUI(); return false; }
  savedPublic = current.is_public; updateVisibilityUI();
  return changeView('blog', false);
}
function updateCount() {
  if (!editor) return;
  const count = [...editor.getText()].length; const minutes = Math.max(1, Math.ceil(count / 500));
  $('character-count').textContent = `${count.toLocaleString()}자 · 약 ${minutes}분`;
}
function updateOutline() {
  if (!editor) return;
  const headings = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') headings.push({ text: node.textContent || '제목', pos, level: node.attrs.level });
  });
  $('outline').innerHTML = headings.length ? headings.map((h, i) => `<button class="outline-item" data-outline="${i}" style="padding-left:${10 + (h.level - 2) * 10}px">${escapeHTML(h.text)}</button>`).join('') : '<p class="outline-empty">본문에 제목을 추가하면<br>여기에 목차가 생겨요.</p>';
  $('outline').querySelectorAll('[data-outline]').forEach(button => button.addEventListener('click', () => {
    const h = headings[Number(button.dataset.outline)];
    const dom = editor.view.nodeDOM(h.pos); dom?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    editor.commands.setTextSelection(h.pos + 1); editor.commands.focus(undefined, { scrollIntoView: false });
    if (innerWidth < 1024) ui().inspector = false;
  }));
}
function updateToolbar() {
  if (!editor || editor.isDestroyed) return;
  updateTableCellMenu();
  const imageSelected = editor.isActive('image');
  $('image-edit-button').disabled = !imageSelected;
  $('image-edit-button').setAttribute('aria-pressed', String(imageSelected && Boolean($('editor').querySelector('.memo-image-node.is-editing'))));
  const active = { bold: editor.isActive('bold'), italic: editor.isActive('italic'), underline: editor.isActive('underline'), strike: editor.isActive('strike'), highlight: editor.isActive('highlight'), bulletList: editor.isActive('bulletList'), taskList: editor.isActive('taskList') };
  document.querySelectorAll('[data-command]').forEach(button => {
    const cmd = button.dataset.command;
    if (Object.hasOwn(active, cmd)) { button.classList.toggle('active', active[cmd]); button.setAttribute('aria-pressed', String(active[cmd])); }
    if (cmd === 'undo') button.disabled = !editor.can().undo();
    if (cmd === 'redo') button.disabled = !editor.can().redo();
  });
  $('block-type').value = editor.isActive('heading') ? `h${editor.getAttributes('heading').level}` : 'paragraph';
  const style = editor.getAttributes('textStyle');
  $('font-family').value = style.fontFamily || '';
  syncFontSizeSelect(style.fontSize || '17px');
  const lineHeight = selectedBlockLineHeight(editor);
  document.querySelectorAll('[data-line-height]').forEach(button => {
    const selected = button.dataset.lineHeight === lineHeight;
    button.setAttribute('aria-checked', String(selected)); button.classList.toggle('active', selected);
  });
  $('line-height-button').textContent = lineHeight ? `${Math.round(Number(lineHeight) * 100)}%` : '줄간격';
  $('line-height-custom-input').value = lineHeight ? String(Math.round(Number(lineHeight) * 100)) : '';
  $('line-height-custom-input').placeholder = lineHeight ? '' : '혼합';
}
function updateTableCellMenu() {
  const menu = $('table-cell-menu');
  const controls = $('table-selection-controls');
  if (!menu || !editor || editor.isDestroyed || !editor.isEditable || !(editor.isActive('tableCell') || editor.isActive('tableHeader'))) { if (menu) menu.hidden = true; if (controls) controls.hidden = true; return; }
  const selected = selectedRect(editor.state); const tablePos = selected.tableStart - 1;
  const tableDOM = editor.view.nodeDOM(tablePos); const tableElement = tableDOM instanceof HTMLTableElement ? tableDOM : tableDOM?.querySelector?.('table');
  const wrap = $('editor').parentElement; if (!tableElement || !wrap) { menu.hidden = true; controls.hidden = true; return; }
  menu.hidden = false;
  const wrapRect = wrap.getBoundingClientRect(); const tableRect = tableElement.getBoundingClientRect();
  menu.style.top = `${tableRect.top - wrapRect.top + wrap.scrollTop + 8}px`;
  menu.style.left = `${Math.min(tableRect.right - wrapRect.left + wrap.scrollLeft + 8, wrap.clientWidth - menu.offsetWidth)}px`;
  menu.querySelector('[data-cell-action="mergeCells"]').disabled = !editor.can().mergeCells();
  menu.querySelector('[data-cell-action="addRow"]').disabled = !editor.can().addRowAfter();
  menu.querySelector('[data-cell-action="addColumn"]').disabled = !editor.can().addColumnAfter();
  renderTableSelectionControls(controls, wrap, tableElement, selected, wrapRect);
}
function renderTableSelectionControls(controls, wrap, table, selected, wrapRect) {
  const { map, tableStart } = selected; const tableRect = table.getBoundingClientRect();
  const left = tableRect.left - wrapRect.left + wrap.scrollLeft; const top = tableRect.top - wrapRect.top + wrap.scrollTop;
  const columns = [...table.querySelectorAll('colgroup col')];
  const widthAt = index => columns[index]?.getBoundingClientRect().width || tableRect.width / map.width;
  const xAt = index => left + Array.from({ length: index }, (_, i) => widthAt(i)).reduce((a, b) => a + b, 0) + widthAt(index) / 2;
  const rowRects = [...table.rows].map(row => row.getBoundingClientRect());
  let html = `<button class="table-selector table-selector-corner" data-select-table aria-label="표 전체 선택" title="표 전체 선택" style="left:${left - 10}px;top:${top - 10}px">↖</button>`;
  for (let row = 0; row < map.height; row++) {
    const rect = rowRects[row]; if (!rect) continue;
    html += `<button class="table-selector" data-select-row="${row}" aria-label="${row + 1}행 선택" title="${row + 1}행 선택" style="left:${left - 10}px;top:${rect.top - wrapRect.top + wrap.scrollTop + rect.height / 2 - 10}px">＋</button>`;
  }
  for (let col = 0; col < map.width; col++) html += `<button class="table-selector" data-select-column="${col}" aria-label="${col + 1}열 선택" title="${col + 1}열 선택" style="left:${xAt(col) - 10}px;top:${top - 10}px">＋</button>`;
  controls.innerHTML = html; controls.hidden = false;
}
function selectTableRange(kind, index) {
  const selected = selectedRect(editor.state); const { map, tableStart } = selected; const doc = editor.state.doc;
  const cellPosition = (row, col) => tableStart + map.map[row * map.width + col];
  let selection;
  if (kind === 'row') selection = CellSelection.rowSelection(doc.resolve(cellPosition(index, 0)), doc.resolve(cellPosition(index, map.width - 1)));
  else if (kind === 'column') selection = CellSelection.colSelection(doc.resolve(cellPosition(0, index)), doc.resolve(cellPosition(map.height - 1, index)));
  else selection = new CellSelection(doc.resolve(cellPosition(0, 0)), doc.resolve(cellPosition(map.height - 1, map.width - 1)));
  editor.view.dispatch(editor.state.tr.setSelection(selection)); editor.commands.focus();
}
function renderMetadata() {
  $('document-notebook').textContent = $('breadcrumb-notebook').textContent = $('info-notebook').textContent = notebookName(current.notebook_id);
  $('display-date').textContent = readableDate(current.document_date);
  $('info-date').textContent = current.document_date.replaceAll('-', '.');
  $('info-modified').textContent = time(current.updated_at);
  updateVisibilityUI();
  $('document-tags').innerHTML = current.tags.map(tag => `<button class="chip" data-tag="${escapeHTML(tag)}">#${escapeHTML(tag)}</button>`).join('');
  $('favorite-button').classList.toggle('active', current.favorite);
  $('favorite-button').setAttribute('aria-label', current.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가');
  $('favorite-button').setAttribute('aria-pressed', String(current.favorite));
  $('document-icon').textContent = current.icon || ''; $('document-icon').hidden = !current.icon;
  const cover = safeImage(current.cover);
  $('cover-container').hidden = !cover;
  $('cover-container').innerHTML = cover ? `<img src="${escapeHTML(cover)}" alt="메모 표지"><button class="button secondary" data-action="remove-cover">표지 제거</button>` : '';
}
async function openNote(id, targetView = 'editor') {
  if (voice.active) stopVoice();
  if (!(await ensureSaved())) return;
  const found = notes.find(n => n.id === id && !n.deleted);
  if (!found) { toast('기록을 찾지 못했어요.'); return; }
  loading = true; clearTimeout(timer); current = clone(found); selectedPublic = savedPublic = Boolean(current.is_public); editVersion = persistedVersion = 0; saveError = null;
  editor?.destroy(); bubble.hidden = false; document.body.append(bubble);
  $('editor').replaceChildren(); $('document-title').value = current.title;
  editor = createMemoEditor({ element: $('editor'), content: current.content, bubble, imageName: imageNameApi(),
    onSlash: () => requestAnimationFrame(openInsert), onImage: file => run(() => prepareImage(file, 'body')),
    onPaste: payload => run(() => pasteIntoEditor(payload)),
    onUpdate: touch, onSelectionUpdate: updateToolbar, onTransaction: updateToolbar,
  });
  loading = false; renderMetadata(); updateCount(); updateOutline(); updateToolbar(); refreshImageRecovery();
  savedStatus('saved', `${adapter.mode === 'demo' ? '이 기기에 저장됨' : '서버 저장됨'} · ${time(current.updated_at)}`);
  await changeView(targetView, false); autoHeight(); ui().drawer = false;
  if (targetView === 'editor') scrollTo({ top: 0 });
}
async function createNote(daily = false) {
  if (!(await ensureSaved())) return;
  const today = localDate();
  if (daily) {
    const existing = notes.find(n => n.daily_key === today && !n.deleted);
    if (existing) return openNote(existing.id);
  }
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(), title: daily ? `${new Date().getMonth() + 1}월 ${new Date().getDate()}일의 기록` : '',
    notebook_id: notebooks.some(n => n.id === notebookFilter) ? notebookFilter : notebooks[0]?.id,
    tags: [], content: newDocument(), document_date: today, favorite: false, deleted: false, is_public: false,
    revision: 0, schema_version: 1, created_at: now, updated_at: now, icon: '', cover: null,
    plain_text: '', daily_key: daily ? today : null,
  };
  if (daily) item.content = { type: 'doc', content: [p(''), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '오늘 기억하고 싶은 것' }] }, p(''), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '내일의 나에게' }] }, p('')] };
  const saved = await adapter.save(item); notes.push(saved); renderNavigation(); await openNote(saved.id);
  $('document-title').focus();
}
async function changeView(next, save = true) {
  if (voice.active && next !== 'editor') stopVoice();
  if (save && !(await ensureSaved())) return false;
  if (next === 'editor' && !current) { await createNote(); return true; }
  if (view === 'blog') blogScroll = scrollY;
  view = next;
  ['editor', 'blog', 'reader'].forEach(name => { $(`${name}-view`).hidden = name !== next; });
  document.querySelectorAll('[data-view]').forEach(button => {
    const selected = button.dataset.view === next || (next === 'reader' && button.dataset.view === 'blog');
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  document.body.dataset.view = next; ui().focus = next === 'editor' ? ui().focus : false;
  if (next === 'blog') { run(() => renderBlog(!blogCards.length)); requestAnimationFrame(() => scrollTo({ top: blogScroll })); }
  if (next === 'reader') { renderReader(); scrollTo({ top: 0 }); }
  if (next === 'editor') { readerEditor?.destroy(); readerEditor = null; requestAnimationFrame(autoHeight); }
  ui().drawer = false; refreshIcons(); return true;
}
function renderNavigation() {
  const live = notes.filter(n => !n.deleted);
  $('count-all').textContent = live.length;
  $('count-favorites').textContent = live.filter(n => n.favorite).length;
  $('notebook-list').innerHTML = notebooks.map(n => `<div class="notebook-row"><button class="nav-item notebook-open ${notebookFilter === n.id && filter === 'notebook' ? 'active' : ''}" data-notebook="${escapeHTML(n.id)}">${icon('folder')}<span>${escapeHTML(n.name)}</span><span class="nav-count">${live.filter(item => item.notebook_id === n.id).length}</span></button><div class="notebook-actions"><button class="icon-button small" data-action="rename-notebook" data-notebook-id="${escapeHTML(n.id)}" aria-label="${escapeHTML(n.name)} 이름 수정" title="이름 수정">${icon('square-pen')}</button>${n.name === '일상 기록' ? '' : `<button class="icon-button small danger" data-action="delete-notebook" data-notebook-id="${escapeHTML(n.id)}" aria-label="${escapeHTML(n.name)} 삭제" title="삭제">${icon('trash-2')}</button>`}</div></div>`).join('');
  const tags = [...new Set(live.flatMap(n => n.tags))].sort((a, b) => a.localeCompare(b, 'ko'));
  $('sidebar-tags').innerHTML = tags.length ? tags.map(t => `<button class="${tagFilter === t ? 'active' : ''}" data-tag="${escapeHTML(t)}">#${escapeHTML(t)}</button>`).join('') : '<span class="demo-label">태그로 생각을 모아 보세요.</span>';
  document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === filter));
  refreshIcons();
}
function filteredNotes() {
  const search = $('blog-search').value.trim().toLocaleLowerCase(); const month = $('month-filter').value;
  return notes.filter(n => {
    if (filter === 'trash' ? !n.deleted : n.deleted) return false;
    if (filter === 'favorites' && !n.favorite) return false;
    if (filter === 'today' && n.document_date !== localDate()) return false;
    if (filter === 'notebook' && n.notebook_id !== notebookFilter) return false;
    if (filter === 'tag' && !n.tags.includes(tagFilter)) return false;
    if (month && !n.document_date.startsWith(month)) return false;
    return !search || `${n.title}\n${plainText(n.content)}\n${n.tags.join(' ')}`.toLocaleLowerCase().includes(search);
  }).sort((a, b) => b.document_date.localeCompare(a.document_date) || b.updated_at.localeCompare(a.updated_at));
}
function dayLabel(date) {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const prefix = date === localDate() ? '오늘 · ' : date === localDate(yesterday) ? '어제 · ' : '';
  return prefix + new Date(`${date}T12:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
function cardMarkup(n) {
  const source = notes.find(item => item.id === n.id); const excerpt = n.excerpt ?? (source ? plainText(source.content).slice(0, 240) : '');
  const image = n.image !== undefined ? { src: safeImage(n.image), linkUrl: '' } : (safeImage(source?.cover) ? { src: safeImage(source.cover), linkUrl: '' } : findImageInfo(source?.content));
  const dimensions = n.image_width && n.image_height ? ` width="${n.image_width}" height="${n.image_height}"` : '';
  const media = image.src ? `<div class="card-media"><img class="card-photo" src="${escapeHTML(image.src)}" alt="" loading="lazy"${dimensions}></div>` : '';
  const tags = n.tags ?? source?.tags ?? []; const deleted = n.deleted ?? source?.deleted; const favorite = n.favorite ?? source?.favorite;
  const notebook = n.notebook ?? notebookName(n.notebook_id ?? source?.notebook_id); const isPublic = n.is_public ?? source?.is_public;
  return `<article class="note-card">${media}<button class="card-open" data-note="${escapeHTML(n.id)}" ${deleted ? 'disabled' : ''} aria-label="${escapeHTML(n.title || '제목 없는 메모')} 읽기"><h2 class="card-title">${escapeHTML(n.icon || source?.icon || '')} ${escapeHTML(n.title || '제목 없는 메모')}</h2><p class="card-excerpt">${escapeHTML(excerpt || '아직 본문이 없는 메모예요.')}</p><div class="card-meta"><span>${escapeHTML(notebook)}</span>${tags.map(t => `<span>#${escapeHTML(t)}</span>`).join('')}<span>${escapeHTML(n.document_date)}</span><span class="card-private">${icon(isPublic ? 'book-open-text' : 'lock-keyhole')}<span>${isPublic ? '공개' : '나만 보기'}</span></span></div></button>${!deleted ? `<button class="icon-button card-star ${favorite ? 'active' : ''}" data-card-favorite="${escapeHTML(n.id)}" aria-label="${favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}" aria-pressed="${favorite}">${icon('star')}</button>` : `<div class="trash-actions"><button class="button secondary" data-restore="${escapeHTML(n.id)}">복원</button></div>`}</article>`;
}
function renderBlogLocal() {
  $('blog-heading').textContent = filter === 'trash' ? '휴지통' : filter === 'favorites' ? '소중한 기록' : '나의 이야기';
  $('blog-filters').innerHTML = `<button class="filter-chip ${filter === 'all' ? 'active' : ''}" data-blog-filter="">전체</button>` + notebooks.map(n => `<button class="filter-chip ${filter === 'notebook' && notebookFilter === n.id ? 'active' : ''}" data-blog-filter="${escapeHTML(n.id)}">${escapeHTML(n.name)}</button>`).join('');
  const found = filteredNotes();
  $('results-summary').textContent = `${activeFilterLabel} · ${found.length}개의 기록${$('blog-search').value ? ' · 검색 결과' : ''}`;
  $('blog-feed').innerHTML = found.map(n => {
    const contentImage = findImageInfo(n.content); const image = safeImage(n.cover) ? { src: safeImage(n.cover), linkUrl: '' } : contentImage; const excerpt = plainText(n.content).slice(0, 240);
    const media = image.src ? (image.linkUrl ? `<a class="card-media-link" href="${escapeHTML(image.linkUrl)}" target="_blank" rel="noopener noreferrer" aria-label="YouTube 영상 열기"><img class="card-photo" src="${escapeHTML(image.src)}" alt="" loading="lazy"></a>` : `<div class="card-media"><img class="card-photo" src="${escapeHTML(image.src)}" alt="" loading="lazy"></div>`) : '';
    return `<article class="note-card">${media}<button class="card-open" data-note="${escapeHTML(n.id)}" ${n.deleted ? 'disabled' : ''} aria-label="${escapeHTML(n.title || '제목 없는 메모')} 읽기"><h2 class="card-title">${escapeHTML(n.icon || '')} ${escapeHTML(n.title || '제목 없는 메모')}</h2><p class="card-excerpt">${escapeHTML(excerpt || '아직 본문이 없는 메모예요.')}</p><div class="card-meta"><span>${escapeHTML(notebookName(n.notebook_id))}</span>${n.tags.map(t => `<span>#${escapeHTML(t)}</span>`).join('')}<span>${escapeHTML(n.document_date)}</span><span class="card-private">${icon(n.is_public ? 'book-open-text' : 'lock-keyhole')}<span>${n.is_public ? '공개' : '나만 보기'}</span></span></div></button>${!n.deleted ? `<button class="icon-button card-star ${n.favorite ? 'active' : ''}" data-card-favorite="${escapeHTML(n.id)}" aria-label="${n.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}" aria-pressed="${n.favorite}">${icon('star')}</button>` : `<div class="trash-actions"><button class="button secondary" data-restore="${escapeHTML(n.id)}">복원</button></div>`}</article>`;
  }).join('');
  if (!found.length) $('blog-feed').innerHTML = `<div class="empty-state">${icon(filter === 'trash' ? 'trash-2' : 'notebook-pen')}<h2>${filter === 'trash' ? '휴지통이 비어 있어요' : '아직 기록이 없어요'}</h2><p>${$('blog-search').value || $('month-filter').value ? '검색어나 날짜 조건을 바꿔 보세요.' : '떠오른 생각을 한 줄부터 남겨 보세요.'}</p><button class="button secondary" data-action="clear-filters">필터 초기화</button><button class="button primary" data-action="new">새 메모</button></div>`;
  blogMasonry?.destroy(); blogMasonry = createMasonry($('blog-feed')); refreshIcons();
}
function blogParams(cursor = '') {
  return { cursor, filter, notebook: notebookFilter, tag: tagFilter, month: $('month-filter').value, search: $('blog-search').value.trim() };
}
async function renderBlog(reset = false) {
  if (adapter.mode !== 'django') { renderBlogLocal(); return; }
  if (!reset && blogPageStarted && !blogCursor) return;
  if (blogCardsLoading && !reset) return;
  const request = reset ? ++blogRequest : blogRequest;
  if (reset) { blogCards = []; blogCursor = null; blogPageStarted = false; $('blog-feed').replaceChildren(); }
  blogCardsLoading = true; $('blog-page-status').textContent = '기록을 불러오는 중…'; $('blog-retry').hidden = true; $('blog-load-more').hidden = true;
  try {
    const page = await adapter.cards(blogParams(reset ? '' : blogCursor));
    if (request !== blogRequest) return;
    const seen = new Set(blogCards.map(item => item.id)); blogCards.push(...page.items.filter(item => !seen.has(item.id))); blogCursor = page.next_cursor; blogPageStarted = true;
    $('blog-heading').textContent = filter === 'trash' ? '휴지통' : filter === 'favorites' ? '소중한 기록' : '나의 이야기';
    $('blog-filters').innerHTML = `<button class="filter-chip ${filter === 'all' ? 'active' : ''}" data-blog-filter="">전체</button>` + notebooks.map(n => `<button class="filter-chip ${filter === 'notebook' && notebookFilter === n.id ? 'active' : ''}" data-blog-filter="${escapeHTML(n.id)}">${escapeHTML(n.name)}</button>`).join('');
    $('results-summary').textContent = `${activeFilterLabel} · ${blogCards.length}개의 기록 표시 중`;
    $('blog-feed').innerHTML = blogCards.length ? blogCards.map(cardMarkup).join('') : `<div class="empty-state public-empty"><h2>${filter === 'trash' ? '휴지통이 비어 있어요' : '아직 기록이 없어요'}</h2><p>검색어나 날짜 조건을 바꿔 보세요.</p></div>`;
    blogMasonry?.destroy(); blogMasonry = createMasonry($('blog-feed')); refreshIcons();
    $('blog-page-status').textContent = blogCursor ? '' : blogCards.length ? '마지막 기록까지 모두 불러왔습니다.' : '';
    $('blog-load-more').hidden = !blogCursor;
  } catch (error) { if (request === blogRequest) { $('blog-page-status').textContent = error.message; $('blog-retry').hidden = false; } }
  finally { if (request === blogRequest) blogCardsLoading = false; }
}
function renderReader() {
  if (!current) return;
  readerEditor?.destroy(); $('reader-content').replaceChildren();
  $('reader-title').textContent = `${current.icon ? `${current.icon} ` : ''}${current.title || '제목 없는 메모'}`;
  $('reader-date').textContent = readableDate(current.document_date);
  $('reader-tags').innerHTML = `<span class="chip notebook-chip">${escapeHTML(notebookName(current.notebook_id))}</span>` + current.tags.map(t => `<button class="chip" data-tag="${escapeHTML(t)}">#${escapeHTML(t)}</button>`).join('');
  const cover = safeImage(current.cover); $('reader-cover').innerHTML = cover ? `<img src="${escapeHTML(cover)}" alt="메모 표지">` : '';
  readerEditor = createMemoEditor({ element: $('reader-content'), content: current.content, editable: false });
  $('reader-word-count').textContent = `${[...plainText(current.content)].length.toLocaleString()}자 · 나만의 기록`;
  const ordered = filteredNotes(), index = ordered.findIndex(n => n.id === current.id);
  const adjacent = [ordered[index + 1], index > 0 ? ordered[index - 1] : null];
  $('adjacent-notes').innerHTML = adjacent.map((n, i) => n ? `<button data-note="${escapeHTML(n.id)}"><span>${i ? '다음 기록 →' : '← 이전 기록'}</span>${escapeHTML(n.title || '제목 없는 메모')}</button>` : '<span></span>').join('');
  refreshIcons();
}
async function applyFilter(next, value = '') {
  if (!(await ensureSaved())) return;
  filter = next; notebookFilter = next === 'notebook' ? value : ''; tagFilter = next === 'tag' ? value : '';
  activeFilterLabel = next === 'notebook' ? notebookName(value) : next === 'tag' ? `#${value}` : ({ all: '전체 기록', favorites: '즐겨찾기', trash: '휴지통', today: '오늘의 기록' }[next] || '전체 기록');
  blogScroll = 0; blogCards = []; blogCursor = null; renderNavigation(); await changeView('blog', false);
}
const insertItems = [
  ['camera', '사진 촬영', '카메라로 바로 찍어 올리기', 'camera'], ['voice', '음성 입력', '말하는 대로 받아 적기', 'mic'], ['image', '사진', '사진과 함께 기억하기', 'image'], ['file', '파일 첨부', '문서·압축 파일 20MB까지', 'paperclip'], ['taskList', '체크리스트', '오늘의 할 일', 'list-todo'],
  ['h2', '제목', '문단을 나누는 제목', 'file-text'], ['bulletList', '글머리 목록', '생각을 차례로 정리', 'list'],
  ['orderedList', '번호 목록', '순서가 있는 기록', 'list'], ['blockquote', '인용문', '기억하고 싶은 한 문장', 'quote'],
  ['horizontalRule', '구분선', '잠깐 쉬어 가기', 'minus'], ['codeBlock', '코드 블록', '개발 메모 남기기', 'code'],
  ['table', '표', '3 × 3 표 넣기', 'table'], ['moveUp', '문단 위로', '현재 블록 이동', 'arrow-up'],
  ['moveDown', '문단 아래로', '현재 블록 이동', 'arrow-down'], ['paragraph', '본문', '일반 문단으로 전환', 'file-text'],
];
function renderInsert() {
  const term = $('insert-search').value.trim().toLowerCase();
  const items = [...insertItems];
  $('insert-items').innerHTML = items.filter(item => item.join(' ').toLowerCase().includes(term)).map(([command, label, hint, name]) => `<button class="insert-item" data-insert="${command}">${icon(name)}<span>${label}<small>${hint}</small></span></button>`).join(''); refreshIcons();
}
function openInsert() { rememberSelection(); $('insert-search').value = ''; renderInsert(); showDialog('insert-dialog', 'insert-search'); }
function execute(command) {
  if (!editor) return;
  const chain = editor.chain().focus();
  const commands = { bold: 'toggleBold', italic: 'toggleItalic', underline: 'toggleUnderline', strike: 'toggleStrike', bulletList: 'toggleBulletList', orderedList: 'toggleOrderedList', taskList: 'toggleTaskList', blockquote: 'toggleBlockquote', codeBlock: 'toggleCodeBlock', horizontalRule: 'setHorizontalRule', paragraph: 'setParagraph', undo: 'undo', redo: 'redo', addRow: 'addRowAfter', addColumn: 'addColumnAfter', deleteRow: 'deleteRow', deleteColumn: 'deleteColumn', deleteTable: 'deleteTable', mergeCells: 'mergeCells', splitCell: 'splitCell' };
  if (commands[command]) chain[commands[command]]().run();
  else if (command === 'fitColumns') {
    const { map, table, tableStart, left, right } = selectedRect(editor.state); const tablePos = tableStart - 1;
    const dom = editor.view.nodeDOM(tablePos); const tableDOM = dom instanceof HTMLTableElement ? dom : dom?.querySelector?.('table');
    const colDOM = [...(tableDOM?.querySelectorAll('colgroup col') || [])]; const fallback = tableDOM?.getBoundingClientRect().width / map.width || 90;
    const widths = Array.from({ length: map.width }, (_, i) => colDOM[i]?.getBoundingClientRect().width || fallback);
    const targetWidth = widths.slice(left, right).reduce((sum, width) => sum + width, 0) / (right - left);
    const tr = editor.state.tr; const selectedColumns = new Set(Array.from({ length: right - left }, (_, i) => left + i));
    table.descendants((node, pos) => {
      if (!['tableCell', 'tableHeader'].includes(node.type.name)) return;
      const rect = map.findCell(pos); const colwidth = Array.from({ length: node.attrs.colspan }, (_, i) => selectedColumns.has(rect.left + i) ? Math.round(targetWidth) : Math.round(widths[rect.left + i] || fallback));
      if (!node.attrs.colwidth || colwidth.some((width, i) => width !== node.attrs.colwidth[i])) tr.setNodeMarkup(tablePos + 1 + pos, undefined, { ...node.attrs, colwidth });
    });
    if (tr.docChanged) editor.view.dispatch(tr);
    editor.commands.focus();
  }
  else if (command === 'deleteSelection') {
    const selection = editor.state.selection;
    if (selection instanceof CellSelection) {
      const rect = selectedRect(editor.state);
      if (rect.left === 0 && rect.right === rect.map.width && rect.top === 0 && rect.bottom === rect.map.height) { editor.commands.deleteTable(); return; }
      if (selection.isRowSelection()) { editor.commands.deleteRow(); return; }
      if (selection.isColSelection()) { editor.commands.deleteColumn(); return; }
    }
    const cells = [];
    if (typeof selection.forEachCell === 'function') selection.forEachCell((node, pos) => cells.push({ node, pos }));
    else {
      const { $from } = selection; let depth = $from.depth;
      while (depth > 0 && !['tableCell', 'tableHeader'].includes($from.node(depth).type.name)) depth--;
      if (depth > 0) cells.push({ node: $from.node(depth), pos: $from.before(depth) });
    }
    const tr = editor.state.tr;
    cells.sort((a, b) => b.pos - a.pos).forEach(({ node, pos }) => { const blank = node.type.createAndFill(); if (blank) tr.replaceWith(pos, pos + node.nodeSize, blank); });
    if (tr.docChanged) editor.view.dispatch(tr);
    editor.commands.focus();
  }
  else if (/^h[234]$/.test(command)) chain.toggleHeading({ level: Number(command[1]) }).run();
  else if (command === 'highlight') chain.toggleHighlight({ color: '#695325' }).run();
  else if (command === 'table') chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  else if (command === 'align') { const currentAlignment = editor.getAttributes('paragraph').textAlign || editor.getAttributes('heading').textAlign || 'left'; const choices = ['left', 'center', 'right']; chain.setTextAlign(choices[(choices.indexOf(currentAlignment) + 1) % 3]).run(); }
  else if (command === 'moveUp' || command === 'moveDown') { if (!moveBlock(editor, command === 'moveUp' ? -1 : 1)) toast('이 방향으로는 더 이동할 수 없어요.'); }
}
async function prepareImage(file, purpose) {
  if (!current || !file) return;
  imagePurpose = purpose; rememberSelection();
  if (file.size > 5 * 1024 * 1024) file = await downscaleImage(file);
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024) { toast('5MB 이하의 JPG, PNG, WebP, GIF 사진을 선택해 주세요.'); return; }
  toast(adapter.mode === 'demo' ? '사진을 이 기기에 넣을 준비 중이에요…' : '사진을 업로드하고 있어요…');
  const uploaded = await adapter.upload(file);
  if (!safeImage(uploaded.url)) throw new Error('사용할 수 없는 이미지 주소예요.');
  pendingImage = uploaded; $('image-preview').src = uploaded.url; $('image-alt').value = ''; $('image-caption').value = '';
  showDialog('image-dialog', 'image-alt');
}
// 음성 입력: 브라우저(Web Speech API)의 한국어 받아쓰기를 본문(또는 제목)에 이어 적는다.
let voice = { rec: null, active: false, target: null }, lastEditable = null;
document.addEventListener('focusin', event => { const t = event.target; if (t?.id === 'document-title' || t?.closest?.('#editor')) lastEditable = t.id === 'document-title' ? 'title' : 'body'; });
function setVoiceUi(on) {
  document.querySelectorAll('[data-action="voice"]').forEach(button => { button.classList.toggle('listening', on); button.setAttribute('aria-pressed', String(on)); });
}
function stopVoice() { voice.active = false; setVoiceUi(false); try { voice.rec?.stop(); } catch {} voice.rec = null; }
function insertSpoken(text) {
  if (!text || !current) return;
  if (voice.target === 'title') {
    const el = $('document-title'); el.value = `${el.value}${el.value && !/\s$/.test(el.value) ? ' ' : ''}${text}`.slice(0, el.maxLength > 0 ? el.maxLength : 200);
    el.dispatchEvent(new Event('input', { bubbles: true })); return;
  }
  editor.chain().focus().insertContent(`${text} `).run();
}
function toggleVoice() {
  if (voice.active) { stopVoice(); toast('음성 입력을 껐어요.'); return; }
  const Ctor = speechCtor(window);
  if (!Ctor) { toast('이 브라우저는 음성 입력을 지원하지 않아요. 안드로이드 Chrome에서 사용해 주세요.'); return; }
  if (!current || view !== 'editor') { toast('메모를 연 상태에서 사용해 주세요.'); return; }
  const rec = new Ctor(); rec.lang = 'ko-KR'; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
  voice = { rec, active: true, target: lastEditable === 'title' ? 'title' : 'body' };
  rec.onresult = event => insertSpoken(finalTranscript(event));
  rec.onerror = event => {
    const message = speechErrorMessage(event.error);
    if (message) { toast(message); stopVoice(); }
  };
  // 잠깐 조용하면 브라우저가 스스로 끝내므로, 사용자가 끄기 전까지는 다시 시작한다.
  rec.onend = () => { if (voice.active && voice.rec === rec) { try { rec.start(); } catch { stopVoice(); } } };
  try { rec.start(); setVoiceUi(true); toast('듣고 있어요. 말씀해 주세요. (다시 누르면 종료)'); } catch { stopVoice(); toast('음성 입력을 시작하지 못했어요.'); }
}
const ATTACHMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|hwpx?|txt|csv|md|rtf|od[tsp]|zip|7z)$/i;
async function attachFile(file) {
  if (!current || !file) return;
  if (!ATTACHMENT_EXT.test(file.name)) { toast('PDF, 문서, 스프레드시트, 프레젠테이션, 텍스트, 압축 파일만 첨부할 수 있어요.'); return; }
  if (file.size === 0) { toast('빈 파일은 첨부할 수 없어요.'); return; }
  if (file.size > 20 * 1024 * 1024) { toast('20MB 이하의 파일만 첨부할 수 있어요.'); return; }
  const noteId = current.id;
  toast('파일을 업로드하고 있어요…');
  const uploaded = await adapter.uploadFile(file);
  if (!current || current.id !== noteId || editor.isDestroyed) { toast('다른 메모로 이동해 첨부하지 못했어요. 다시 시도해 주세요.'); return; }
  restoreSelection();
  editor.chain().focus().insertContent({ type: 'fileAttachment', attrs: { id: uploaded.id, name: uploaded.name, size: uploaded.size } }).run();
  toast('파일을 첨부했어요.');
}
function chooseAttachment() { rememberSelection(); $('attachment-file').value = ''; $('attachment-file').click(); }
function chooseCamera() { imagePurpose = 'body'; rememberSelection(); $('camera-file').value = ''; $('camera-file').click(); }
function chooseImage(purpose) { imagePurpose = purpose; rememberSelection(); $('image-file').value = ''; $('image-file').click(); }
function findExternalImageSources(doc) {
  const sources = [];
  function walk(node) {
    if (node?.type === 'image' && /^https?:\/\//i.test(node.attrs?.src || '')) sources.push(node.attrs.src);
    (node?.content || []).forEach(walk);
  }
  if (doc) walk(doc);
  return [...new Set(sources)];
}
function refreshImageRecovery() {
  const external = editor && !editor.isDestroyed ? findExternalImageSources(editor.getJSON()).length : 0;
  $('image-import-retry').hidden = !external && !failedImageImports.size;
}
function findTextMatch(value) {
  let match = null;
  editor.state.doc.descendants((node, pos) => {
    const index = node.isText ? node.text.indexOf(value) : -1;
    if (!match && index >= 0) match = { from: pos + index, to: pos + index + value.length };
  });
  return match;
}

/**
 * Apply configuration values to the DOM.
 *   - Elements with data-ui-string attribute will have their textContent replaced by the value from the server.
 *   - Elements with data-menu-key will have their label and href updated according to the menu item.
 */
function applyConfig(config) {
  // Update UI strings
  document.querySelectorAll('[data-ui-string]').forEach(el => {
    const key = el.dataset.uiString;
    const fallback = el.textContent;
    const val = config.getUIString(key, fallback);
    if (val !== undefined) el.textContent = val;
  });
  // Update menu items
  document.querySelectorAll('[data-menu-key]').forEach(el => {
    const key = el.dataset.menuKey;
    const menu = config.getMenuItem(key);
    if (menu) {
      const textEl = el.querySelector('span') || el;
      textEl.textContent = menu.label ?? textEl.textContent;
      if (el.tagName === 'A' && menu.url) {
        el.href = menu.url;
      }
      if (el.getAttribute('aria-label')) {
        el.setAttribute('aria-label', menu.label ?? el.getAttribute('aria-label'));
      }
    }
  });
}
// Export applyConfig for testing purposes
export { applyConfig };
function replaceTextMarker(value, replacement) {
  const match = findTextMatch(value);
  return match ? editor.commands.insertContentAt(match, replacement) : false;
}
function replacePasteToken(token, uploaded, alt = '', linkUrl = '', noteId = current?.id) {
  if (!current || current.id !== noteId || editor.isDestroyed) return false;
  const match = findTextMatch(token);
  if (!match) return false;
  const inserted = editor.commands.insertContentAt(match, { type: 'image', attrs: normalizeImageAttrs({ alt, linkUrl }, uploaded.url) });
  if (inserted) editor.commands.setTextSelection(Math.min(match.from + 1, editor.state.doc.content.size));
  return inserted;
}
function trackImageImport(token, input, alt = '', linkUrl = '') {
  const noteId = current?.id;
  const failureLabel = '⟦이미지 가져오기 실패 · “이미지 다시 가져오기”로 재시도하세요⟧';
  const task = (async () => {
    try {
      const uploaded = input.file ? await adapter.upload(input.file) : await adapter.importImage(input.url);
      if (!safeImage(uploaded.url)) throw new Error('사용할 수 없는 이미지 주소입니다.');
      if (!replacePasteToken(token, uploaded, alt, linkUrl, noteId)) { failedImageImports.delete(token); return false; }
      failedImageImports.delete(token); toast('이미지를 안전하게 가져왔어요.'); return true;
    } catch (error) {
      if (!current || current.id !== noteId || !replaceTextMarker(token, failureLabel)) { failedImageImports.delete(token); return false; }
      failedImageImports.set(token, { input, alt, linkUrl, failureLabel, noteId });
      savedStatus('error', '이미지 가져오기 실패 · 다시 시도');
      toast(error.message || '이미지를 가져오지 못했어요.'); return false;
    } finally {
      pendingImageImports.delete(task); refreshImageRecovery();
    }
  })();
  pendingImageImports.add(task); refreshImageRecovery(); return task;
}
function safePastedHTML(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,iframe,object,embed,form,meta,link').forEach(node => node.remove());
  if (document.querySelector('img')) {
    const markerNodes = [];
    const walker = document.createTreeWalker(document.body, 4);
    while (walker.nextNode()) {
      if (/^<\/?yt-image>$/i.test(walker.currentNode.textContent.trim())) markerNodes.push(walker.currentNode);
    }
    const markers = new Set(markerNodes.map(node => node.textContent.trim().toLowerCase()));
    if (markers.has('<yt-image>') && markers.has('</yt-image>')) {
      markerNodes.forEach(node => {
        const block = node.parentElement?.closest('p,div');
        if (block && /^<\/?yt-image>$/i.test(block.textContent.trim()) && !block.querySelector('img')) block.remove();
        else node.remove();
      });
    }
  }
  const images = [], imageAnchors = new Set();
  document.querySelectorAll('img').forEach(img => {
    const token = `⟦이미지 가져오기 대기 ${++pasteImageSequence}⟧`;
    const url = img.getAttribute('src') || '';
    const anchor = img.closest('a[href]');
    const linkUrl = normalizeYouTubeURL(anchor?.getAttribute('href')) || youtubeURLFromThumbnail(url);
    images.push({ token, url, alt: img.getAttribute('alt') || '', linkUrl });
    if (anchor) imageAnchors.add(anchor);
    img.replaceWith(document.createTextNode(token));
  });
  imageAnchors.forEach(anchor => anchor.replaceWith(...anchor.childNodes));
  const allowed = new Set(['href', 'colspan', 'rowspan', 'start', 'checked']);
  document.body.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => { if (!allowed.has(attr.name.toLowerCase())) node.removeAttribute(attr.name); });
    if (node.tagName === 'A') {
      try { if (!['http:', 'https:'].includes(new URL(node.getAttribute('href')).protocol)) node.removeAttribute('href'); }
      catch { node.removeAttribute('href'); }
    }
  });
  document.body.querySelectorAll('mark').forEach(mark => mark.replaceWith(...mark.childNodes));
  const textNodes = [];
  const textWalker = document.createTreeWalker(document.body, 4);
  while (textWalker.nextNode()) {
    if (textWalker.currentNode.textContent) textNodes.push(textWalker.currentNode);
  }
  textNodes.forEach(node => {
    const span = document.createElement('span'); span.style.color = '#ffffff'; span.textContent = node.textContent; node.replaceWith(span);
  });
  return { html: document.body.innerHTML, images };
}
async function pasteIntoEditor(payload) {
  if (payload.file) {
    const token = `⟦이미지 가져오기 대기 ${++pasteImageSequence}⟧`;
    let metadata = { alt: '', linkUrl: '' };
    if (payload.html) {
      const parsed = safePastedHTML(payload.html);
      if (parsed.images.length === 1) metadata = parsed.images[0];
    }
    editor.commands.insertContent(token); savedStatus('saving', '이미지를 업로드하는 중…');
    trackImageImport(token, { file: payload.file }, metadata.alt, metadata.linkUrl); return;
  }
  const normalized = safePastedHTML(payload.html);
  editor.commands.insertContent(normalized.html);
  savedStatus('saving', '이미지를 가져오는 중…');
  normalized.images.forEach(image => trackImageImport(image.token, { url: image.url }, image.alt, image.linkUrl));
}
async function recoverExternalImages() {
  for (const [token, failed] of [...failedImageImports]) {
    if (current?.id !== failed.noteId || !replaceTextMarker(failed.failureLabel, token)) { failedImageImports.delete(token); continue; }
    failedImageImports.delete(token); trackImageImport(token, failed.input, failed.alt, failed.linkUrl);
  }
  if (pendingImageImports.size) await Promise.all([...pendingImageImports]);
  const sources = findExternalImageSources(editor.getJSON());
  for (const source of sources) {
    try {
      savedStatus('saving', '기존 이미지를 가져오는 중…');
      const uploaded = await adapter.importImage(source);
      const doc = editor.getJSON();
      (function replace(node) {
        if (node?.type === 'image' && node.attrs?.src === source) node.attrs = normalizeImageAttrs({ ...node.attrs, linkUrl: normalizeYouTubeURL(node.attrs?.linkUrl) || youtubeURLFromThumbnail(source) }, uploaded.url);
        (node?.content || []).forEach(replace);
      })(doc);
      editor.commands.setContent(doc); failedImageImports.clear();
    } catch (error) { savedStatus('error', '이미지 가져오기 실패 · 다시 시도'); toast(error.message); break; }
  }
  refreshImageRecovery();
  if (!findExternalImageSources(editor.getJSON()).length && !failedImageImports.size) toast('기존 이미지를 안전하게 가져왔어요. 이제 저장할 수 있습니다.');
}
function downloadCurrent() {
  if (!current) return;
  const snapshot = { ...clone(current), content: editor.getJSON(), title: $('document-title').value };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); const url = URL.createObjectURL(blob); a.href = url;
  a.download = `${(snapshot.title || '스마트메모').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function updateStoredNote(id, patch) {
  if (!(await ensureSaved())) return;
  const existing = notes.find(n => n.id === id); if (!existing) return;
  const saved = await adapter.save({ ...clone(existing), ...patch });
  notes[notes.findIndex(n => n.id === id)] = saved;
  if (current?.id === id) { current = clone(saved); renderMetadata(); }
  channel?.postMessage({ id, revision: saved.revision }); renderNavigation(); if (view === 'blog') renderBlog(true);
}

const actions = {
  home: () => changeView('blog'), new: () => createNote(), today: () => createNote(true), save: saveAndOpenBlog,
  read: () => changeView('reader'), edit: () => changeView('editor'), 'back-blog': () => changeView('blog'),
  search: async () => { if (await changeView('blog')) $('blog-search').focus(); }, insert: openInsert,
  camera: chooseCamera, voice: () => toggleVoice(),
  'image-edit': () => {
    if (!editor?.isActive('image')) return;
    const imageNode = editor.view.nodeDOM(editor.state.selection.from);
    imageNode?.dispatchEvent(new imageNode.ownerDocument.defaultView.CustomEvent('memo-image-edit'));
    updateToolbar();
  },
  link: () => { rememberSelection(); $('link-url').value = editor.getAttributes('link').href || ''; showDialog('link-dialog', 'link-url'); },
  tags: () => { $('tags-input').value = current.tags.join(', '); showDialog('tags-dialog', 'tags-input'); },
  metadata: () => { $('meta-notebook').innerHTML = notebooks.map(n => `<option value="${escapeHTML(n.id)}">${escapeHTML(n.name)}</option>`).join(''); $('meta-notebook').value = current.notebook_id; $('meta-date').value = current.document_date; $('meta-private').checked = !selectedPublic; updateVisibilityHelp(); showDialog('metadata-dialog'); },
  'add-notebook': () => { $('notebook-name').value = ''; showDialog('notebook-dialog', 'notebook-name'); },
  'line-height': () => {
    const menu = $('line-height-menu'); menu.hidden = !menu.hidden;
    $('line-height-button').setAttribute('aria-expanded', String(!menu.hidden));
  },
  'rename-notebook': button => {
    const notebook = notebooks.find(item => item.id === button.dataset.notebookId); if (!notebook) return;
    editingNotebookId = notebook.id; $('notebook-rename-name').value = notebook.name; showDialog('notebook-rename-dialog', 'notebook-rename-name');
  },
  'delete-notebook': async button => {
    if (!(await ensureSaved())) return;
    const target = notebooks.find(item => item.id === button.dataset.notebookId); if (!target) return;
    const count = notes.filter(item => item.notebook_id === target.id).length;
    const message = count ? `“${target.name}” 메모장을 삭제할까요? 포함된 메모 ${count}개는 “일상 기록”으로 이동합니다.` : `“${target.name}” 메모장을 삭제할까요?`;
    if (!(await confirmAction(message, '삭제'))) return;
    const result = await adapter.deleteNotebook(target.id); const fallback = result.fallback_notebook;
    notes.forEach(note => { if (note.notebook_id === target.id) note.notebook_id = fallback.id; });
    if (current?.notebook_id === target.id) { current.notebook_id = fallback.id; renderMetadata(); }
    notebooks = notebooks.filter(item => item.id !== target.id);
    if (!notebooks.some(item => item.id === fallback.id)) notebooks.unshift(fallback);
    if (notebookFilter === target.id) { filter = 'all'; notebookFilter = ''; activeFilterLabel = '전체 기록'; }
    renderNavigation(); if (view === 'blog') await renderBlog(true);
    toast(result.moved_count ? `메모 ${result.moved_count}개를 일상 기록으로 옮기고 메모장을 삭제했어요.` : '메모장을 삭제했어요.');
  },
  favorite: async () => { current.favorite = !current.favorite; renderMetadata(); touch(); await saveCurrent(); },
  cover: () => chooseImage('cover'), 'remove-cover': () => { current.cover = null; renderMetadata(); touch(); },
  icon: () => { const choices = ['', '✍️', '🌿', '💡', '📖', '☕']; current.icon = choices[(choices.indexOf(current.icon || '') + 1) % choices.length]; renderMetadata(); touch(); },
  help: () => showDialog('help-dialog'),
  settings: () => { $('body-size').value = prefs.bodySize; $('autosave-toggle').checked = prefs.autosave; renderShortcuts(); showDialog('settings-dialog'); },
  'retry-images': recoverExternalImages,
  export: downloadCurrent,
  delete: async () => { if (!(await confirmAction('이 기록을 휴지통으로 옮길까요? 휴지통에서 다시 복원할 수 있어요.', '휴지통으로'))) return; await updateStoredNote(current.id, { deleted: true }); current = null; editVersion = persistedVersion = 0; await changeView('blog'); toast('휴지통으로 옮겼어요.'); },
  'clear-filters': async () => { $('blog-search').value = ''; $('month-filter').value = ''; await applyFilter('all'); },
};
document.addEventListener('click', event => {
  const selector = event.target.closest('[data-select-row],[data-select-column],[data-select-table]');
  if (selector) { event.preventDefault(); if (selector.hasAttribute('data-select-row')) selectTableRange('row', Number(selector.dataset.selectRow)); else if (selector.hasAttribute('data-select-column')) selectTableRange('column', Number(selector.dataset.selectColumn)); else selectTableRange('table'); return; }
  const cellAction = event.target.closest('[data-cell-action]');
  if (cellAction) { event.preventDefault(); execute(cellAction.dataset.cellAction); return; }
  if (!event.target.closest('.line-height-control')) { $('line-height-menu').hidden = true; $('line-height-button').setAttribute('aria-expanded', 'false'); }
  const close = event.target.closest('[data-close]'); if (close) { close.closest('dialog').close(); return; }
  const button = event.target.closest('button,a'); if (!button || button.disabled) return;
  if (button.dataset.action) { event.preventDefault(); run(() => actions[button.dataset.action]?.(button)); }
  else if (button.dataset.lineHeight) { setBlockLineHeight(editor, button.dataset.lineHeight); $('line-height-menu').hidden = true; $('line-height-button').setAttribute('aria-expanded', 'false'); editor.commands.focus(); }
  else if (button.dataset.command) execute(button.dataset.command);
  else if (button.dataset.view) run(() => changeView(button.dataset.view));
  else if (button.dataset.filter) run(() => button.dataset.filter === 'today' ? createNote(true) : applyFilter(button.dataset.filter));
  else if (button.dataset.notebook) run(() => applyFilter('notebook', button.dataset.notebook));
  else if (Object.hasOwn(button.dataset, 'blogFilter')) run(() => applyFilter(button.dataset.blogFilter ? 'notebook' : 'all', button.dataset.blogFilter));
  else if (button.dataset.tag) run(() => applyFilter('tag', button.dataset.tag));
  else if (button.dataset.note) run(() => openNote(button.dataset.note, 'reader'));
  else if (button.dataset.cardFavorite) run(() => updateStoredNote(button.dataset.cardFavorite, { favorite: !notes.find(n => n.id === button.dataset.cardFavorite).favorite }));
  else if (button.dataset.restore) run(async () => { await updateStoredNote(button.dataset.restore, { deleted: false }); toast('기록을 복원했어요.'); });
  else if (button.dataset.layout) { const compact = button.dataset.layout === 'compact'; $('blog-feed').classList.toggle('compact', compact); document.querySelectorAll('[data-layout]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); blogMasonry?.layout(); }
  else if (button.dataset.insert) { $('insert-dialog').close(); restoreSelection(); if (button.dataset.insert === 'image') chooseImage('body'); else if (button.dataset.insert === 'camera') chooseCamera(); else if (button.dataset.insert === 'voice') toggleVoice(); else if (button.dataset.insert === 'file') chooseAttachment(); else execute(button.dataset.insert); }
});
// Prevent formatting buttons from collapsing an existing text selection.
document.addEventListener('mousedown', event => { if (event.target.closest('[data-command], [data-cell-action], .line-height-control button, #bubble-menu [data-action=link]')) event.preventDefault(); });
document.addEventListener('memo-image-edit-state', updateToolbar);
$('document-title').addEventListener('input', () => { autoHeight(); touch(); });
$('editor').addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
$('editor').addEventListener('compositionend', () => { composing = false; if (isDirty() && prefs.autosave) timer = setTimeout(() => run(saveCurrent), 1500); });
$('document-title').addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
$('document-title').addEventListener('compositionend', () => { composing = false; touch(); });
$('block-type').addEventListener('change', event => execute(event.target.value));
$('font-family').addEventListener('change', event => editor.chain().focus().setFontFamily(event.target.value).run());
// 글자 크기: 목록 값 선택 또는 '직접입력'(8~96px). 목록에 없는 값은 임시 option 으로 표시한다.
const FONT_SIZE_MIN = 8, FONT_SIZE_MAX = 96;
function syncFontSizeSelect(value) {
  const select = $('font-size');
  select.querySelectorAll('option[data-custom]').forEach(option => option.remove());
  if (value && ![...select.options].some(option => option.value === value)) {
    const option = document.createElement('option');
    option.value = value; option.textContent = value.replace(/px$/, ''); option.dataset.custom = '';
    select.insertBefore(option, select.querySelector('option[value="custom"]'));
  }
  select.value = value;
}
$('font-size').addEventListener('change', event => {
  const select = event.target;
  if (select.value !== 'custom') { editor.chain().focus().setFontSize(select.value).run(); return; }
  const current = editor.getAttributes('textStyle').fontSize?.replace(/px$/, '') || '17';
  const input = window.prompt(`글자 크기를 숫자로 입력하세요 (${FONT_SIZE_MIN}~${FONT_SIZE_MAX})`, current);
  const size = input === null ? NaN : Number(input.trim());
  if (!Number.isInteger(size) || size < FONT_SIZE_MIN || size > FONT_SIZE_MAX) {
    if (input !== null) savedStatus('error', `글자 크기는 ${FONT_SIZE_MIN}~${FONT_SIZE_MAX} 사이의 정수여야 합니다.`);
    syncFontSizeSelect(editor.getAttributes('textStyle').fontSize || '17px'); editor.commands.focus(); return;
  }
  editor.chain().focus().setFontSize(`${size}px`).run();
  syncFontSizeSelect(`${size}px`);
});
function applyCustomLineHeight() {
  const percent = Number($('line-height-custom-input').value);
  const value = normalizeBlockLineHeight(percent / 100);
  if (!value) { toast('줄간격은 100%에서 300% 사이로 입력해 주세요.'); $('line-height-custom-input').focus(); return; }
  setBlockLineHeight(editor, value); $('line-height-menu').hidden = true; $('line-height-button').setAttribute('aria-expanded', 'false'); editor.commands.focus();
}
$('line-height-custom-apply').addEventListener('click', applyCustomLineHeight);
$('line-height-custom-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applyCustomLineHeight(); } });
$('text-color').addEventListener('input', event => editor.chain().focus().setColor(event.target.value).run());
$('blog-search').addEventListener('input', () => { if (adapter.mode !== 'django') { renderBlogLocal(); return; } clearTimeout(blogSearchTimer); blogSearchTimer = setTimeout(() => run(() => renderBlog(true)), 250); }); $('month-filter').addEventListener('change', () => run(() => renderBlog(true)));
$('blog-load-more').addEventListener('click', () => run(() => renderBlog(false))); $('blog-retry').addEventListener('click', () => run(() => renderBlog(false)));
$('clear-month').addEventListener('click', () => { $('month-filter').value = ''; run(() => renderBlog(true)); });
$('insert-search').addEventListener('input', renderInsert);
$('attachment-file').addEventListener('change', event => run(() => attachFile(event.target.files[0])));
$('camera-file')?.addEventListener('change', event => run(async () => { const file = event.target.files[0]; if (file) await prepareImage(await downscaleImage(file), 'body'); }));
$('image-file').addEventListener('change', event => run(() => prepareImage(event.target.files[0], imagePurpose)));
$('link-form').addEventListener('submit', event => {
  event.preventDefault(); const value = $('link-url').value.trim();
  try { if (!['http:', 'https:'].includes(new URL(value).protocol)) throw Error(); } catch { toast('http 또는 https 주소를 입력해 주세요.'); return; }
  $('link-dialog').close(); restoreSelection();
  if (editor.state.selection.empty) editor.chain().focus().insertContent({ type: 'text', text: value, marks: [{ type: 'link', attrs: { href: value, target: '_blank', rel: 'noopener noreferrer' } }] }).run();
  else editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
});
$('unlink-button').addEventListener('click', () => { $('link-dialog').close(); restoreSelection(); editor.chain().focus().extendMarkRange('link').unsetLink().run(); });
$('tags-form').addEventListener('submit', event => { event.preventDefault(); current.tags = [...new Set($('tags-input').value.split(',').map(v => v.trim().replace(/^#+/, '').slice(0, 30)).filter(Boolean))].slice(0, 10); $('tags-dialog').close(); renderMetadata(); touch(); });
function updateVisibilityHelp() { $('visibility-help').textContent = $('meta-private').checked ? '체크하면 이 글은 나만 볼 수 있습니다.' : '누구나 이 글을 볼 수 있습니다.'; }
$('meta-private').addEventListener('change', updateVisibilityHelp);
$('metadata-form').addEventListener('submit', event => { event.preventDefault(); current.notebook_id = $('meta-notebook').value; current.document_date = $('meta-date').value; selectedPublic = !$('meta-private').checked; $('metadata-dialog').close(); updateVisibilityUI(); touch(); });
$('visibility-select').addEventListener('change', event => { selectedPublic = event.target.value === 'public'; updateVisibilityUI(); });
function updateVisibilityUI() {
  const pending = selectedPublic !== savedPublic; const label = selectedPublic ? '전체 공개' : '나만 보기';
  $('visibility-select').value = selectedPublic ? 'public' : 'private';
  $('visibility-warning').hidden = !selectedPublic;
  $('footer-visibility').textContent = `${label}${pending ? ' · 저장 전' : ''}`;
  $('info-visibility').textContent = `${label}${pending ? ' · 저장 전' : ''}`;
}
$('notebook-form').addEventListener('submit', event => { event.preventDefault(); run(async () => { const name = $('notebook-name').value.trim(); if (!name) return; if (notebooks.some(n => n.name === name)) { toast('같은 이름의 메모장이 있어요.'); return; } const item = await adapter.addNotebook(name); notebooks.push(item); $('notebook-dialog').close(); renderNavigation(); if (view === 'blog') renderBlog(); toast('새 메모장을 만들었어요.'); }); });
$('notebook-rename-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const name = normalizeNotebookName($('notebook-rename-name').value);
  if (!name || !editingNotebookId) return;
  if (hasDuplicateNotebookName(notebooks, name, editingNotebookId)) { toast('같은 이름의 메모장이 있어요.'); return; }
  const saved = await adapter.renameNotebook(editingNotebookId, name);
  const notebook = notebooks.find(item => item.id === editingNotebookId); if (notebook) notebook.name = saved.name;
  editingNotebookId = null; $('notebook-rename-dialog').close(); renderNavigation();
  if (current) renderMetadata(); if (view === 'blog') await renderBlog(true); toast('메모장 이름을 수정했어요.');
}); });
$('image-form').addEventListener('submit', event => { event.preventDefault(); if (!pendingImage) return; $('image-dialog').close(); if (imagePurpose === 'cover') { current.cover = pendingImage.url; renderMetadata(); touch(); } else { restoreSelection(); editor.chain().focus().setImage({ src: pendingImage.url, alt: $('image-alt').value.trim(), caption: $('image-caption').value.trim(), width: '100%' }).run(); } pendingImage = null; });
$('settings-form').addEventListener('submit', event => { event.preventDefault(); prefs = { bodySize: $('body-size').value, autosave: $('autosave-toggle').checked }; applyPrefs(); try { localStorage.setItem('smartmemo-ui-prefs', JSON.stringify(prefs)); } catch { toast('화면 설정을 이 기기에 보관하지 못했어요.'); } $('settings-dialog').close(); if (prefs.autosave && isDirty()) run(saveCurrent); else clearTimeout(timer); });
$('shortcut-editor').addEventListener('change', event => {
  const input = event.target.closest('[data-shortcut-index]'); if (!input) return;
  const index = Number(input.dataset.shortcutIndex); const key = normalizeShortcut(input.value);
  if (!key) { toast('Ctrl+Shift+R 형식의 키 조합을 입력해 주세요.'); renderShortcuts(); return; }
  if (shortcuts.some((item, i) => i !== index && item.key === key)) { toast('이미 사용 중인 단축키입니다.'); renderShortcuts(); return; }
  shortcuts[index].key = key; saveShortcuts(); renderShortcuts();
});
$('shortcut-editor').addEventListener('click', event => {
  const button = event.target.closest('[data-shortcut-remove]'); if (!button) return;
  shortcuts.splice(Number(button.dataset.shortcutRemove), 1); saveShortcuts(); renderShortcuts();
});
$('shortcut-add').addEventListener('click', () => {
  const action = $('shortcut-new-action').value; const key = normalizeShortcut($('shortcut-new-key').value);
  if (!action || !key) { toast('명령과 Ctrl+Shift+R 형식의 키 조합을 지정해 주세요.'); return; }
  if (shortcuts.some(item => item.action === action || item.key === key)) { toast('명령이나 단축키가 이미 등록되어 있습니다.'); return; }
  shortcuts.push({ action, key }); saveShortcuts(); $('shortcut-new-key').value = ''; renderShortcuts();
});
$('save-status').addEventListener('click', () => { if (saveError?.code === 'conflict') downloadCurrent(); });
function applyPrefs() { document.documentElement.style.setProperty('--body-size', `${prefs.bodySize}px`); $('autosave-label').textContent = prefs.autosave ? (adapter?.mode === 'django' ? '서버 자동 저장' : '브라우저 자동 저장') : '자동 저장 꺼짐'; }
document.addEventListener('keydown', event => {
  if (event.isComposing) return;
  const target = event.target;
  if (target?.matches?.('input,textarea,select') && !target.closest('#editor')) return;
  const key = eventShortcut(event); if (!key) return;
  const binding = shortcuts.find(item => item.key === key); if (!binding) return;
  event.preventDefault();
  const command = binding.action;
  if (command === 'save') { if (current) run(saveInEditor); }
  else if (command === 'search') run(actions.search);
  else if (command === 'link') { if (view === 'editor') run(actions.link); }
  else if (command.startsWith('align')) { const value = { alignLeft: 'left', alignCenter: 'center', alignRight: 'right' }[command]; editor.chain().focus().setTextAlign(value).run(); }
  else if (command === 'insert') openInsert();
  else if (['bold','italic','underline','strike','undo','redo','bulletList','orderedList','taskList','blockquote','codeBlock'].includes(command)) execute(command);
});
window.addEventListener('beforeunload', event => { if (isDirty()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { if (isDirty()) run(saveCurrent); });
function viewportChanged() {
  ui().mobile = innerWidth < 1024;
  const viewport = window.visualViewport;
  const editing = document.activeElement?.matches('textarea,input,[contenteditable=true]');
  const offset = viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
  ui().keyboard = innerWidth < 640 && Boolean(editing) && offset > 100;
  document.documentElement.style.setProperty('--keyboard-offset', `${ui().keyboard ? offset : 0}px`);
  if (view === 'editor') autoHeight();
}
window.addEventListener('resize', viewportChanged); window.visualViewport?.addEventListener('resize', viewportChanged); window.visualViewport?.addEventListener('scroll', viewportChanged);
document.addEventListener('focusin', viewportChanged); document.addEventListener('focusout', () => setTimeout(viewportChanged, 80));

async function init() {
  try {
    const stored = JSON.parse(localStorage.getItem('smartmemo-shortcuts'));
    if (Array.isArray(stored)) {
      const legacyDefaults = Object.fromEntries(defaultShortcuts.map(item => [item.action, item.key]));
      const valid = stored.filter(item => shortcutActions.some(([id]) => id === item.action) && normalizeShortcut(item.key)).map(item => {
        const old = { save: 's', search: 'k', link: 'shift+k', bold: 'b', italic: 'i', underline: 'u', strike: 'shift+x', undo: 'z', redo: 'shift+z', alignLeft: 'shift+l', alignCenter: 'shift+e', alignRight: 'shift+r', bulletList: 'shift+8', orderedList: 'shift+7', taskList: 'shift+9', blockquote: 'shift+q', codeBlock: 'shift+c' };
        return { action: item.action, key: item.key === old[item.action] ? legacyDefaults[item.action] : normalizeShortcut(item.key) };
      });
      if (new Set(valid.map(item => item.key)).size === valid.length) shortcuts = valid.map(item => ({ action: item.action, key: normalizeShortcut(item.key) }));
    }
  } catch {}
  renderShortcuts();
  config = JSON.parse($('smartmemo-config').textContent);
  config.assetBase ||= './assets/'; adapter = createAdapter(config); await adapter.init();
  // Fetch UI configuration from the server in Django mode
  if (config.mode === 'django') {
    try {
      const fetched = await loadConfig(config);
      window.appConfig = new ConfigStore(fetched);
      applyConfig(window.appConfig);
    } catch (e) {
      console.warn('Failed to load UI config:', e);
    }
  }
  [notes, notebooks] = await Promise.all([adapter.list(), adapter.notebooks()]);
  new IntersectionObserver(entries => { if (view === 'blog' && entries.some(entry => entry.isIntersecting)) run(() => renderBlog(false)); }, { rootMargin: '500px' }).observe($('blog-feed-sentinel'));
  try { const stored = JSON.parse(localStorage.getItem('smartmemo-ui-prefs')); if (stored && ['17', '19', '21'].includes(stored.bodySize) && typeof stored.autosave === 'boolean') prefs = stored; } catch {}
  applyPrefs(); renderNavigation();
  $('mode-label').textContent = adapter.mode === 'demo' ? '퍼블리싱 데모 · 이 브라우저에 저장' : '로그인한 나만의 기록';
  if (adapter.mode === 'demo' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(config.storageKey);
    channel.onmessage = async event => {
      try { notes = await adapter.list(); renderNavigation(); if (view === 'blog') renderBlog(); if (event.data.id === current?.id) toast('다른 탭에서 이 기록이 변경됐어요. 저장 시 충돌 여부를 확인합니다.'); } catch (error) { report(error); }
    };
  }
  // 로그인/재방문 시 마지막 편집 화면이 아니라 블로그 목록으로 시작한다. 특정 글은 명시적으로 지정된 경우에만 연다.
  // 데모(로그인 없음)는 기존처럼 가장 최근 글을 열고, 로그인 환경에서는 명시한 글이 없으면 목록으로 시작한다.
  const initialId = config.initialNoteId || (adapter.mode === 'demo' ? notes.filter(n => !n.deleted).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]?.id : null);
  if (initialId) await openNote(initialId, query.get('view') === 'read' ? 'reader' : 'editor');
  else await changeView('blog', false);
  if (query.get('view') === 'blog') await changeView('blog');
  if (query.get('new') === '1') await createNote();
  refreshIcons(); document.body.dataset.ready = 'true';
  window.SmartMemo = Object.freeze({
    flush: saveCurrent,
    replaceTextMarker,
    getSnapshot: () => current ? clone({ ...current, content: editor.getJSON() }) : null,
    exportJSON: downloadCurrent,
    destroy: () => { if (disposed) return; disposed = true; clearTimeout(timer); clearTimeout(toastTimer); editor?.destroy(); readerEditor?.destroy(); channel?.close(); adapter.close(); },
  });
}
// 로그아웃 전에 저장하지 않은 편집 내용을 먼저 저장한다. 저장에 실패하면 내용 유실을 막기 위해 로그아웃하지 않는다.
document.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.action.endsWith('/logout/') || form.dataset.saved === 'true') return;
  event.preventDefault();
  run(async () => {
    if (!(await ensureSaved())) return;
    form.dataset.saved = 'true'; form.submit();
  });
});
init().catch(error => { console.error(error); $('boot-error').textContent = error.message || '편집기를 열지 못했어요. 실행 환경을 확인해 주세요.'; $('boot-error').hidden = false; document.querySelectorAll('.view').forEach(v => { v.hidden = true; }); });
