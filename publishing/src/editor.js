import { Editor, Extension, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';

export function safeImage(src) {
  if (typeof src !== 'string') return '';
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)) return src;
  if (src.startsWith('./assets/') || src.startsWith('/')) {
    if (src.startsWith('//') || /[\x00-\x1f\\]/.test(src)) return '';
    return src;
  }
  try { const u = new URL(src); return ['https:', 'http:'].includes(u.protocol) ? src : ''; } catch { return ''; }
}
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export function normalizeYouTubeURL(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
    let id = '';
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else id = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1] || '';
    } else if (url.hostname === 'youtu.be') id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] || '';
    return VIDEO_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : '';
  } catch { return ''; }
}
export function youtubeURLFromThumbnail(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'i.ytimg.com' || url.username || url.password || (url.port && url.port !== '443')) return '';
    const id = url.pathname.match(/^\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//)?.[1] || '';
    return VIDEO_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : '';
  } catch { return ''; }
}
export function normalizeDestinationURL(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) return '';
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}
function normalizeImageWidth(value) {
  if (value === '100%') return '100%';
  const width = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isInteger(width) && width >= 40 && width <= 2400 ? width : '100%';
}
export function normalizeImageAttrs(attrs = {}, src = attrs.src) {
  return {
    ...attrs, src,
    alt: typeof attrs.alt === 'string' ? attrs.alt : '',
    title: typeof attrs.title === 'string' ? attrs.title : null,
    caption: typeof attrs.caption === 'string' ? attrs.caption : '',
    linkUrl: normalizeDestinationURL(attrs.linkUrl) || null,
    width: normalizeImageWidth(attrs.width), height: null,
    alignment: ['left', 'center', 'right'].includes(attrs.alignment) ? attrs.alignment : 'center',
  };
}
const CaptionImage = Image.extend({
  addOptions() { return { ...this.parent?.(), openLinks: false, editable: true }; },
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: { default: '', parseHTML: el => el.closest('figure')?.querySelector('figcaption')?.textContent || '' },
      linkUrl: { default: null, parseHTML: el => normalizeDestinationURL(el.closest('a[href]')?.getAttribute('href')) || null },
      width: { default: '100%', parseHTML: el => normalizeImageWidth(el.closest('figure')?.dataset.width) },
      height: { default: null },
      alignment: { default: 'center', parseHTML: el => ['left', 'center', 'right'].includes(el.closest('figure')?.dataset.align) ? el.closest('figure').dataset.align : 'center' },
    };
  },
  parseHTML() { return [{ tag: 'figure[data-memo-image]', getAttrs: el => {
    const img = el.querySelector('img'); return img ? normalizeImageAttrs({ src: img.getAttribute('src'), alt: img.alt, caption: el.querySelector('figcaption')?.textContent || '', width: el.dataset.width, alignment: el.dataset.align, linkUrl: el.closest('a[href]')?.getAttribute('href') }) : false;
  } }, { tag: 'img[src]', getAttrs: el => normalizeImageAttrs({ src: el.getAttribute('src'), alt: el.alt }) }]; },
  renderHTML({ HTMLAttributes }) {
    const attrs = { src: safeImage(HTMLAttributes.src), alt: String(HTMLAttributes.alt || ''), loading: 'lazy' };
    const caption = String(HTMLAttributes.caption || '');
    const width = normalizeImageWidth(HTMLAttributes.width);
    const alignment = ['left', 'center', 'right'].includes(HTMLAttributes.alignment) ? HTMLAttributes.alignment : 'center';
    const figure = ['figure', { 'data-memo-image': '', 'data-width': String(width), 'data-align': alignment, contenteditable: 'false', style: `width:${width === '100%' ? '100%' : `${width}px`};max-width:100%` },
      ['img', mergeAttributes(this.options.HTMLAttributes, attrs)],
      ...(caption ? [['figcaption', {}, caption]] : [])];
    const linkUrl = normalizeDestinationURL(HTMLAttributes.linkUrl);
    return this.options.openLinks && linkUrl ? ['a', { href: linkUrl, target: '_blank', rel: 'noopener noreferrer' }, figure] : figure;
  },
  addNodeView() {
    if (!this.options.editable) return null;
    return ({ node, editor, getPos, deleteNode }) => {
      const dom = document.createElement('figure');
      dom.className = 'memo-image-node'; dom.dataset.memoImage = ''; dom.contentEditable = 'false';
      const image = document.createElement('img'); image.draggable = false; dom.append(image);
      const caption = document.createElement('figcaption');
      caption.className = 'memo-image-caption'; caption.contentEditable = 'true'; caption.dataset.placeholder = '사진 설명을 입력하세요'; caption.setAttribute('aria-label', '사진 설명'); caption.setAttribute('role', 'textbox');
      dom.append(caption);
      const toolbar = document.createElement('div'); toolbar.className = 'memo-image-toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', '선택한 이미지 편집');
      const makeButton = (label, action, text = label) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.imageAction = action; button.textContent = text; button.setAttribute('aria-label', label); toolbar.append(button); return button; };
      const alignButtons = Object.fromEntries([['left', '왼쪽 정렬'], ['center', '가운데 정렬'], ['right', '오른쪽 정렬']].map(([value, label]) => [value, makeButton(label, `align-${value}`, label.replace(' 정렬', ''))]));
      const sizeLabel = document.createElement('label'); sizeLabel.textContent = '너비 ';
      const size = document.createElement('input'); size.type = 'number'; size.min = '40'; size.max = '2400'; size.step = '1'; size.setAttribute('aria-label', '이미지 너비 픽셀'); sizeLabel.append(size, document.createTextNode('px')); toolbar.append(sizeLabel);
      const reset = makeButton('원래 크기로 되돌리기', 'reset-size', '원래 크기');
      const link = makeButton('이미지 링크 편집', 'link', '링크');
      const remove = makeButton('이미지 삭제', 'delete', '삭제'); remove.className = 'danger';
      dom.append(toolbar);
      const popover = document.createElement('form'); popover.className = 'memo-image-link-popover'; popover.hidden = true;
      const linkInput = document.createElement('input'); linkInput.type = 'url'; linkInput.placeholder = 'https://…'; linkInput.setAttribute('aria-label', '이미지 이동 링크');
      const applyLink = document.createElement('button'); applyLink.type = 'submit'; applyLink.textContent = '적용';
      const removeLink = document.createElement('button'); removeLink.type = 'button'; removeLink.textContent = '링크 제거';
      popover.append(linkInput, applyLink, removeLink); dom.append(popover);
      for (const corner of ['nw', 'ne', 'sw', 'se']) { const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'memo-image-resize-handle'; handle.dataset.corner = corner; handle.setAttribute('aria-label', `이미지 크기 조절 ${corner}`); dom.append(handle); }
      let currentNode = node, composing = false, drag = null;
      const updateAttrs = attrs => {
        const pos = getPos(); if (typeof pos !== 'number') return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, ...attrs }));
      };
      const currentWidth = () => normalizeImageWidth(currentNode.attrs.width) === '100%' ? Math.max(40, Math.round(dom.getBoundingClientRect().width || image.naturalWidth || 640)) : normalizeImageWidth(currentNode.attrs.width);
      const restoreCaptionFromState = () => {
        const selection = document.getSelection();
        const offset = selection?.anchorNode && caption.contains(selection.anchorNode) ? selection.anchorOffset : caption.textContent.length;
        caption.textContent = String(currentNode.attrs.caption || '');
        const range = document.createRange(); const target = caption.firstChild || caption;
        range.setStart(target, Math.min(offset, target.textContent?.length || 0)); range.collapse(true);
        selection?.removeAllRanges(); selection?.addRange(range);
      };
      const sync = () => {
        const attrs = normalizeImageAttrs(currentNode.attrs);
        image.src = safeImage(attrs.src); image.alt = attrs.alt; dom.dataset.align = attrs.alignment; dom.dataset.width = String(attrs.width);
        dom.style.width = attrs.width === '100%' ? '100%' : `${attrs.width}px`;
        if (document.activeElement !== caption && !composing) caption.textContent = attrs.caption;
        if (document.activeElement !== linkInput) linkInput.value = attrs.linkUrl || '';
        size.value = attrs.width === '100%' ? '' : String(attrs.width);
        Object.entries(alignButtons).forEach(([value, button]) => { button.setAttribute('aria-pressed', String(attrs.alignment === value)); });
        link.setAttribute('aria-pressed', String(Boolean(attrs.linkUrl)));
      };
      dom.addEventListener('click', event => {
        if (event.target.closest('.memo-image-toolbar,.memo-image-link-popover,.memo-image-caption,.memo-image-resize-handle')) return;
        const pos = getPos(); if (typeof pos === 'number') { editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))); editor.commands.focus(); }
      });
      Object.entries(alignButtons).forEach(([value, button]) => button.addEventListener('click', () => updateAttrs({ alignment: value })));
      size.addEventListener('change', () => { const width = normalizeImageWidth(size.value); if (width === '100%' && size.value) { size.setCustomValidity('40~2400 사이의 숫자를 입력하세요.'); size.reportValidity(); return; } size.setCustomValidity(''); updateAttrs({ width }); });
      reset.addEventListener('click', () => updateAttrs({ width: '100%' }));
      remove.addEventListener('click', deleteNode);
      link.addEventListener('click', () => { popover.hidden = !popover.hidden; if (!popover.hidden) { linkInput.value = currentNode.attrs.linkUrl || ''; linkInput.focus(); } });
      popover.addEventListener('submit', event => { event.preventDefault(); const value = normalizeDestinationURL(linkInput.value); if (linkInput.value.trim() && !value) { linkInput.setCustomValidity('http 또는 https 절대 주소를 입력하세요.'); linkInput.reportValidity(); return; } linkInput.setCustomValidity(''); updateAttrs({ linkUrl: value || null }); popover.hidden = true; });
      removeLink.addEventListener('click', () => { linkInput.setCustomValidity(''); updateAttrs({ linkUrl: null }); popover.hidden = true; });
      caption.addEventListener('compositionstart', () => { composing = true; });
      caption.addEventListener('compositionend', () => { composing = false; updateAttrs({ caption: caption.textContent.slice(0, 300) }); });
      caption.addEventListener('input', () => { if (!composing) updateAttrs({ caption: caption.textContent.slice(0, 300) }); });
      caption.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); editor.commands[event.key.toLowerCase() === 'z' && !event.shiftKey ? 'undo' : 'redo'](); queueMicrotask(restoreCaptionFromState); } });
      dom.querySelectorAll('.memo-image-resize-handle').forEach(handle => {
        handle.addEventListener('pointerdown', event => { event.preventDefault(); drag = { id: event.pointerId, x: event.clientX, width: currentWidth(), sign: handle.dataset.corner.endsWith('w') ? -1 : 1 }; handle.setPointerCapture?.(event.pointerId); });
        handle.addEventListener('pointermove', event => { if (!drag || drag.id !== event.pointerId) return; const width = Math.max(40, Math.min(2400, Math.round(drag.width + (event.clientX - drag.x) * drag.sign))); dom.style.width = `${width}px`; dom.dataset.dragWidth = String(width); });
        const finish = event => { if (!drag || drag.id !== event.pointerId) return; const width = Number(dom.dataset.dragWidth || drag.width); drag = null; delete dom.dataset.dragWidth; updateAttrs({ width }); };
        handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', () => { drag = null; delete dom.dataset.dragWidth; sync(); });
        handle.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const delta = (event.shiftKey ? 50 : 10) * (event.key === 'ArrowRight' ? 1 : -1); updateAttrs({ width: Math.max(40, Math.min(2400, currentWidth() + delta)) }); });
      });
      sync();
      return {
        dom, update(updated) { if (updated.type !== currentNode.type) return false; currentNode = updated; sync(); return true; },
        selectNode() { dom.classList.add('is-selected'); }, deselectNode() { dom.classList.remove('is-selected'); popover.hidden = true; },
        stopEvent(event) { return Boolean(event.target.closest('.memo-image-toolbar,.memo-image-link-popover,.memo-image-caption,.memo-image-resize-handle')); },
        ignoreMutation() { return true; },
      };
    };
  },
});
export function extensions({ editable = true, onSlash, bubble } = {}) {
  const list = [
    StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: !editable, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }, protocols: ['http', 'https'] } }),
    CaptionImage.configure({ allowBase64: true, openLinks: !editable, editable }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }), TextStyleKit,
    Highlight.configure({ multicolor: true }), TaskList, TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
  ];
  if (editable) {
    list.push(Placeholder.configure({ placeholder: '떠오른 생각을 적어 보세요. / 를 누르면 블록을 추가할 수 있어요.' }));
    list.push(Extension.create({ name: 'memoSlash', addKeyboardShortcuts() { return {
      '/': () => {
        if (this.editor.view.composing) return false;
        const { $from, empty } = this.editor.state.selection;
        if (!empty || !$from.parent.isTextblock || $from.parent.textContent.trim()) return false;
        onSlash?.(); return true;
      },
    }; } }));
    if (bubble) list.push(BubbleMenu.configure({ element: bubble, options: { placement: 'top', offset: 9 }, shouldShow: ({ editor, from, to }) => editor.isEditable && from !== to && !document.querySelector('dialog[open]') }));
  }
  return list;
}
export function createMemoEditor(options) {
  return new Editor({
    element: options.element, extensions: extensions(options), content: options.content,
    editable: options.editable !== false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': options.editable === false ? '메모 본문 읽기' : '메모 본문', 'aria-multiline': 'true', spellcheck: 'true' },
      handlePaste: (view, event, slice) => {
        if (options.editable === false) return false;
        const files = [...(event.clipboardData?.files || [])];
        const itemFile = [...(event.clipboardData?.items || [])].find(item => item.kind === 'file' && item.type?.startsWith('image/'))?.getAsFile?.();
        const file = files.find(candidate => candidate.type?.startsWith('image/')) || (itemFile?.type?.startsWith('image/') ? itemFile : null);
        const html = event.clipboardData?.getData('text/html') || '';
        if (file && options.onPaste) { event.preventDefault(); options.onPaste({ file, html }); return true; }
        if (html && /<img[\s>]/i.test(html) && options.onPaste) { event.preventDefault(); options.onPaste({ html }); return true; }
        const textStyle = view.state.schema.marks.textStyle;
        if (!slice || !textStyle) return false;
        const whiten = fragment => {
          const nodes = [];
          fragment.forEach(node => {
            if (node.isText) {
              const previous = node.marks.find(mark => mark.type === textStyle);
              const marks = node.marks.filter(mark => !['textStyle', 'highlight'].includes(mark.type.name));
              marks.push(textStyle.create({ ...(previous?.attrs || {}), color: '#ffffff', backgroundColor: null }));
              nodes.push(node.mark(marks));
            } else nodes.push(node.content.size ? node.copy(whiten(node.content)) : node);
          });
          return Fragment.fromArray(nodes);
        };
        event.preventDefault();
        view.dispatch(view.state.tr.replaceSelection(new Slice(whiten(slice.content), slice.openStart, slice.openEnd)).scrollIntoView());
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || options.editable === false) return false;
        const file = [...(event.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
        if (file && options.onImage) { event.preventDefault(); options.onImage(file); return true; }
        return false;
      },
    },
    onUpdate: options.onUpdate, onSelectionUpdate: options.onSelectionUpdate,
    onTransaction: options.onTransaction,
  });
}
export function plainText(doc) {
  const blocks = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'text') { blocks.push(node.text || ''); return; }
    if (node.type === 'hardBreak') blocks.push('\n');
    (node.content || []).forEach(walk);
    if (['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'codeBlock'].includes(node.type)) blocks.push('\n');
    if (node.type === 'image' && node.attrs?.caption) blocks.push(node.attrs.caption, '\n');
  }
  walk(doc); return blocks.join('').replace(/\n{3,}/g, '\n\n').trim();
}
export function findImage(doc) {
  return findImageInfo(doc).src;
}
export function findImageInfo(doc) {
  if (doc?.type === 'image') return { src: safeImage(doc.attrs?.src), linkUrl: normalizeDestinationURL(doc.attrs?.linkUrl) };
  for (const child of doc?.content || []) { const found = findImageInfo(child); if (found.src) return found; }
  return { src: '', linkUrl: '' };
}
export function moveBlock(editor, direction) {
  const { doc, selection } = editor.state; const index = selection.$from.index(0);
  const nodes = []; doc.forEach((node, offset) => nodes.push({ node, offset }));
  const target = index + direction;
  if (target < 0 || target >= nodes.length || !nodes[index]) return false;
  const first = Math.min(index, target), last = Math.max(index, target);
  const reordered = [nodes[last].node, nodes[first].node];
  const tr = editor.state.tr.replaceWith(nodes[first].offset, nodes[last].offset + nodes[last].node.nodeSize, reordered);
  const focus = nodes[first].offset + (direction > 0 ? nodes[target].node.nodeSize : 0) + 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(focus, tr.doc.content.size))));
  editor.view.dispatch(tr); editor.commands.focus(); return true;
}
