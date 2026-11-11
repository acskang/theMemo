import './styles.css';
import './link-styles.css';
import './image-node.css';
import './public.css';
import { createMemoEditor } from './editor.js';
import { createMasonry } from './masonry.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const target = document.getElementById('public-note-content');
const source = document.getElementById('public-note-json');
if (target && source) {
  const editor = createMemoEditor({ element: target, content: JSON.parse(source.textContent), editable: false });
  window.addEventListener('pagehide', () => editor.destroy(), { once: true });
}

const feed = document.getElementById('public-blog-feed');
if (feed) {
  const initial = JSON.parse(document.getElementById('public-blog-page').textContent);
  const status = document.getElementById('public-feed-status');
  const more = document.getElementById('public-load-more');
  const retry = document.getElementById('public-retry');
  const seen = new Set([...feed.querySelectorAll('[data-card-id]')].map(card => card.dataset.cardId)); let cursor = initial.next_cursor; let loading = false;
  const masonry = createMasonry(feed);
  const card = item => `<article class="note-card"><a class="card-open public-card-link" href="${escapeHTML(item.url)}">${item.image ? `<img class="card-photo public-card-image" src="${escapeHTML(item.image)}" alt="" loading="lazy"${item.image_width && item.image_height ? ` width="${item.image_width}" height="${item.image_height}"` : ''}>` : ''}<h2 class="card-title">${escapeHTML(item.title)}</h2><p class="card-excerpt">${escapeHTML(item.excerpt || '아직 본문이 없는 글입니다.')}</p><p class="card-meta"><span>${escapeHTML(item.document_date)}</span><span>·</span><span class="public-author">${escapeHTML(item.author)}</span></p></a></article>`;
  const append = items => {
    const fresh = items.filter(item => !seen.has(item.id));
    fresh.forEach(item => seen.add(item.id));
    feed.insertAdjacentHTML('beforeend', fresh.map(card).join(''));
    document.getElementById('public-results').textContent = `공개 글 ${seen.size}개 표시 중`;
    if (!seen.size) feed.innerHTML = '<div class="empty-state public-empty"><h2>아직 공개된 글이 없습니다.</h2><p>작성자가 공개한 기록이 생기면 이곳에 표시됩니다.</p></div>';
    masonry.layout();
  };
  const update = () => { more.hidden = !cursor || loading; retry.hidden = true; status.textContent = loading ? '글을 불러오는 중…' : cursor ? '' : seen.size ? '마지막 글까지 모두 불러왔습니다.' : ''; };
  const load = async () => {
    if (loading || !cursor) return;
    loading = true; update();
    try {
      const response = await fetch(`${feed.dataset.cardsUrl}?cursor=${encodeURIComponent(cursor)}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error();
      const page = await response.json(); append(page.items); cursor = page.next_cursor;
    } catch { status.textContent = '글을 불러오지 못했습니다.'; retry.hidden = false; }
    finally { loading = false; if (retry.hidden) update(); }
  };
  document.getElementById('public-results').textContent = `공개 글 ${seen.size}개 표시 중`; masonry.layout(); update(); more.addEventListener('click', load); retry.addEventListener('click', load);
  new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) load(); }, { rootMargin: '500px' }).observe(document.getElementById('public-feed-sentinel'));
}
