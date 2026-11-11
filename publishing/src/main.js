import './styles.css';
import './link-styles.css';
import './image-node.css';
import './visibility.css';
import Alpine from 'alpinejs';
import htmx from 'htmx.org';
import { createIcons, NotebookPen, PanelLeft, Search, Plus, CalendarDays, Files, Star, Folder, FolderOpen, Trash2, Settings2, LockKeyhole, Maximize2, Eye, Undo2, Redo2, Highlighter, AlignLeft, List, ListTodo, Link, ChevronDown, PanelRight, ImagePlus, Smile, X, Clock3, LayoutList, ArrowLeft, Download, SquarePen, BookOpenText, Image, Quote, Minus, Code, Table, ArrowUp, ArrowDown, Rows3, Columns3, Check, FileText, Inbox } from 'lucide';
import { createAdapter } from './adapters.js';
import { createMemoEditor, plainText, findImageInfo, safeImage, normalizeImageAttrs, normalizeYouTubeURL, youtubeURLFromThumbnail, moveBlock } from './editor.js';
import { localDate, newDocument, p } from './sample-data.js';
import { createMasonry } from './masonry.js';

const iconSet = { NotebookPen, PanelLeft, Search, Plus, CalendarDays, Files, Star, Folder, FolderOpen, Trash2, Settings2, LockKeyhole, Maximize2, Eye, Undo2, Redo2, Highlighter, AlignLeft, List, ListTodo, Link, ChevronDown, PanelRight, ImagePlus, Smile, X, Clock3, LayoutList, ArrowLeft, Download, SquarePen, BookOpenText, Image, Quote, Minus, Code, Table, ArrowUp, ArrowDown, Rows3, Columns3, Check, FileText, Inbox };
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
const pendingImageImports = new Set();
const failedImageImports = new Map();
let prefs = { bodySize: '17', autosave: true }; let activeFilterLabel = '전체 기록';
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
window.Alpine = Alpine; window.htmx = htmx; Alpine.start();

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
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
  $('font-size').value = style.fontSize || '17px';
  $('line-height').value = style.lineHeight || '';
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
  if (!(await ensureSaved())) return;
  const found = notes.find(n => n.id === id && !n.deleted);
  if (!found) { toast('기록을 찾지 못했어요.'); return; }
  loading = true; clearTimeout(timer); current = clone(found); selectedPublic = savedPublic = Boolean(current.is_public); editVersion = persistedVersion = 0; saveError = null;
  editor?.destroy(); bubble.hidden = false; document.body.append(bubble);
  $('editor').replaceChildren(); $('document-title').value = current.title;
  editor = createMemoEditor({ element: $('editor'), content: current.content, bubble,
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
  $('notebook-list').innerHTML = notebooks.map(n => `<button class="nav-item ${notebookFilter === n.id && filter === 'notebook' ? 'active' : ''}" data-notebook="${escapeHTML(n.id)}">${icon('folder')}<span>${escapeHTML(n.name)}</span><span class="nav-count">${live.filter(item => item.notebook_id === n.id).length}</span></button>`).join('');
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
  ['image', '사진', '사진과 함께 기억하기', 'image'], ['taskList', '체크리스트', '오늘의 할 일', 'list-todo'],
  ['h2', '제목', '문단을 나누는 제목', 'file-text'], ['bulletList', '글머리 목록', '생각을 차례로 정리', 'list'],
  ['orderedList', '번호 목록', '순서가 있는 기록', 'list'], ['blockquote', '인용문', '기억하고 싶은 한 문장', 'quote'],
  ['horizontalRule', '구분선', '잠깐 쉬어 가기', 'minus'], ['codeBlock', '코드 블록', '개발 메모 남기기', 'code'],
  ['table', '표', '3 × 3 표 넣기', 'table'], ['moveUp', '문단 위로', '현재 블록 이동', 'arrow-up'],
  ['moveDown', '문단 아래로', '현재 블록 이동', 'arrow-down'], ['paragraph', '본문', '일반 문단으로 전환', 'file-text'],
];
function renderInsert() {
  const term = $('insert-search').value.trim().toLowerCase();
  const items = [...insertItems];
  if (editor?.isActive('table')) items.push(['addRow', '표 행 추가', '선택한 행 아래', 'rows-3'], ['addColumn', '표 열 추가', '선택한 열 오른쪽', 'columns-3'], ['deleteRow', '표 행 삭제', '선택한 행 삭제', 'minus'], ['deleteColumn', '표 열 삭제', '선택한 열 삭제', 'minus'], ['deleteTable', '표 삭제', '선택한 표 삭제', 'trash-2']);
  $('insert-items').innerHTML = items.filter(item => item.join(' ').toLowerCase().includes(term)).map(([command, label, hint, name]) => `<button class="insert-item" data-insert="${command}">${icon(name)}<span>${label}<small>${hint}</small></span></button>`).join(''); refreshIcons();
}
function openInsert() { rememberSelection(); $('insert-search').value = ''; renderInsert(); showDialog('insert-dialog', 'insert-search'); }
function execute(command) {
  if (!editor) return;
  const chain = editor.chain().focus();
  const commands = { bold: 'toggleBold', italic: 'toggleItalic', underline: 'toggleUnderline', strike: 'toggleStrike', bulletList: 'toggleBulletList', orderedList: 'toggleOrderedList', taskList: 'toggleTaskList', blockquote: 'toggleBlockquote', codeBlock: 'toggleCodeBlock', horizontalRule: 'setHorizontalRule', paragraph: 'setParagraph', undo: 'undo', redo: 'redo', addRow: 'addRowAfter', addColumn: 'addColumnAfter', deleteRow: 'deleteRow', deleteColumn: 'deleteColumn', deleteTable: 'deleteTable' };
  if (commands[command]) chain[commands[command]]().run();
  else if (/^h[234]$/.test(command)) chain.toggleHeading({ level: Number(command[1]) }).run();
  else if (command === 'highlight') chain.toggleHighlight({ color: '#695325' }).run();
  else if (command === 'table') chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  else if (command === 'align') { const currentAlignment = editor.getAttributes('paragraph').textAlign || editor.getAttributes('heading').textAlign || 'left'; const choices = ['left', 'center', 'right']; chain.setTextAlign(choices[(choices.indexOf(currentAlignment) + 1) % 3]).run(); }
  else if (command === 'moveUp' || command === 'moveDown') { if (!moveBlock(editor, command === 'moveUp' ? -1 : 1)) toast('이 방향으로는 더 이동할 수 없어요.'); }
}
async function prepareImage(file, purpose) {
  if (!current || !file) return;
  imagePurpose = purpose; rememberSelection();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024) { toast('5MB 이하의 JPG, PNG, WebP, GIF 사진을 선택해 주세요.'); return; }
  toast(adapter.mode === 'demo' ? '사진을 이 기기에 넣을 준비 중이에요…' : '사진을 업로드하고 있어요…');
  const uploaded = await adapter.upload(file);
  if (!safeImage(uploaded.url)) throw new Error('사용할 수 없는 이미지 주소예요.');
  pendingImage = uploaded; $('image-preview').src = uploaded.url; $('image-alt').value = ''; $('image-caption').value = '';
  showDialog('image-dialog', 'image-alt');
}
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
  link: () => { rememberSelection(); $('link-url').value = editor.getAttributes('link').href || ''; showDialog('link-dialog', 'link-url'); },
  tags: () => { $('tags-input').value = current.tags.join(', '); showDialog('tags-dialog', 'tags-input'); },
  metadata: () => { $('meta-notebook').innerHTML = notebooks.map(n => `<option value="${escapeHTML(n.id)}">${escapeHTML(n.name)}</option>`).join(''); $('meta-notebook').value = current.notebook_id; $('meta-date').value = current.document_date; $('meta-private').checked = !selectedPublic; updateVisibilityHelp(); showDialog('metadata-dialog'); },
  'add-notebook': () => { $('notebook-name').value = ''; showDialog('notebook-dialog', 'notebook-name'); },
  favorite: async () => { current.favorite = !current.favorite; renderMetadata(); touch(); await saveCurrent(); },
  cover: () => chooseImage('cover'), 'remove-cover': () => { current.cover = null; renderMetadata(); touch(); },
  icon: () => { const choices = ['', '✍️', '🌿', '💡', '📖', '☕']; current.icon = choices[(choices.indexOf(current.icon || '') + 1) % choices.length]; renderMetadata(); touch(); },
  help: () => showDialog('help-dialog'),
  settings: () => { $('body-size').value = prefs.bodySize; $('autosave-toggle').checked = prefs.autosave; showDialog('settings-dialog'); },
  'retry-images': recoverExternalImages,
  export: downloadCurrent,
  delete: async () => { if (!(await confirmAction('이 기록을 휴지통으로 옮길까요? 휴지통에서 다시 복원할 수 있어요.', '휴지통으로'))) return; await updateStoredNote(current.id, { deleted: true }); current = null; editVersion = persistedVersion = 0; await changeView('blog'); toast('휴지통으로 옮겼어요.'); },
  'clear-filters': async () => { $('blog-search').value = ''; $('month-filter').value = ''; await applyFilter('all'); },
};
document.addEventListener('click', event => {
  const close = event.target.closest('[data-close]'); if (close) { close.closest('dialog').close(); return; }
  const button = event.target.closest('button,a'); if (!button || button.disabled) return;
  if (button.dataset.action) { event.preventDefault(); run(() => actions[button.dataset.action]?.()); }
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
  else if (button.dataset.insert) { $('insert-dialog').close(); restoreSelection(); if (button.dataset.insert === 'image') chooseImage('body'); else execute(button.dataset.insert); }
});
// Prevent formatting buttons from collapsing an existing text selection.
document.addEventListener('mousedown', event => { if (event.target.closest('[data-command], #bubble-menu [data-action=link]')) event.preventDefault(); });
$('document-title').addEventListener('input', () => { autoHeight(); touch(); });
$('editor').addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
$('editor').addEventListener('compositionend', () => { composing = false; if (isDirty() && prefs.autosave) timer = setTimeout(() => run(saveCurrent), 1500); });
$('document-title').addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
$('document-title').addEventListener('compositionend', () => { composing = false; touch(); });
$('block-type').addEventListener('change', event => execute(event.target.value));
$('font-family').addEventListener('change', event => editor.chain().focus().setFontFamily(event.target.value).run());
$('font-size').addEventListener('change', event => editor.chain().focus().setFontSize(event.target.value).run());
$('line-height').addEventListener('change', event => { const chain = editor.chain().focus(); if (event.target.value) chain.setLineHeight(event.target.value).run(); else chain.unsetLineHeight().run(); });
$('text-color').addEventListener('input', event => editor.chain().focus().setColor(event.target.value).run());
$('blog-search').addEventListener('input', () => { if (adapter.mode !== 'django') { renderBlogLocal(); return; } clearTimeout(blogSearchTimer); blogSearchTimer = setTimeout(() => run(() => renderBlog(true)), 250); }); $('month-filter').addEventListener('change', () => run(() => renderBlog(true)));
$('blog-load-more').addEventListener('click', () => run(() => renderBlog(false))); $('blog-retry').addEventListener('click', () => run(() => renderBlog(false)));
$('clear-month').addEventListener('click', () => { $('month-filter').value = ''; run(() => renderBlog(true)); });
$('insert-search').addEventListener('input', renderInsert);
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
$('image-form').addEventListener('submit', event => { event.preventDefault(); if (!pendingImage) return; $('image-dialog').close(); if (imagePurpose === 'cover') { current.cover = pendingImage.url; renderMetadata(); touch(); } else { restoreSelection(); editor.chain().focus().setImage({ src: pendingImage.url, alt: $('image-alt').value.trim(), caption: $('image-caption').value.trim(), width: '100%' }).run(); } pendingImage = null; });
$('settings-form').addEventListener('submit', event => { event.preventDefault(); prefs = { bodySize: $('body-size').value, autosave: $('autosave-toggle').checked }; applyPrefs(); try { localStorage.setItem('smartmemo-ui-prefs', JSON.stringify(prefs)); } catch { toast('화면 설정을 이 기기에 보관하지 못했어요.'); } $('settings-dialog').close(); if (prefs.autosave && isDirty()) run(saveCurrent); else clearTimeout(timer); });
$('save-status').addEventListener('click', () => { if (saveError?.code === 'conflict') downloadCurrent(); });
function applyPrefs() { document.documentElement.style.setProperty('--body-size', `${prefs.bodySize}px`); $('autosave-label').textContent = prefs.autosave ? (adapter?.mode === 'django' ? '서버 자동 저장' : '브라우저 자동 저장') : '자동 저장 꺼짐'; }
document.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 's') { event.preventDefault(); if (current) run(saveInEditor); }
  if (key === 'k') { event.preventDefault(); if (event.shiftKey && view === 'editor') actions.link(); else run(actions.search); }
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
  config = JSON.parse($('smartmemo-config').textContent);
  config.assetBase ||= './assets/'; adapter = createAdapter(config); await adapter.init();
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
  const initialId = config.initialNoteId || notes.filter(n => !n.deleted).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]?.id;
  if (initialId) await openNote(initialId, query.get('view') === 'read' ? 'reader' : 'editor');
  else await changeView('blog', false);
  if (query.get('view') === 'blog') await changeView('blog');
  if (query.get('new') === '1') await createNote();
  refreshIcons(); document.body.dataset.ready = 'true';
  window.SmartMemo = Object.freeze({
    flush: saveCurrent,
    getSnapshot: () => current ? clone({ ...current, content: editor.getJSON() }) : null,
    exportJSON: downloadCurrent,
    destroy: () => { if (disposed) return; disposed = true; clearTimeout(timer); clearTimeout(toastTimer); editor?.destroy(); readerEditor?.destroy(); channel?.close(); adapter.close(); },
  });
}
init().catch(error => { console.error(error); $('boot-error').textContent = error.message || '편집기를 열지 못했어요. 실행 환경을 확인해 주세요.'; $('boot-error').hidden = false; document.querySelectorAll('.view').forEach(v => { v.hidden = true; }); });
