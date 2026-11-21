export function nextMenuIndex(current, length, key) {
  if (!length) return -1;
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % length;
  if (key === 'ArrowUp') return current < 0 ? length - 1 : (current - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return current;
}

export function initUserMenu(root = document) {
  const button = root.getElementById('user-menu-btn');
  const menu = root.getElementById('user-menu');
  if (!button || !menu) return;
  const items = () => Array.from(menu.querySelectorAll('[role="menuitem"]'));
  const isOpen = () => !menu.hidden;
  const open = () => { menu.hidden = false; button.setAttribute('aria-expanded', 'true'); items()[0]?.focus(); };
  const close = (returnFocus = false) => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); if (returnFocus) button.focus(); };
  button.addEventListener('click', () => (isOpen() ? close(true) : open()));
  button.addEventListener('keydown', event => { if (event.key === 'ArrowDown' && !isOpen()) { event.preventDefault(); open(); } });
  root.addEventListener('click', event => { if (isOpen() && !menu.contains(event.target) && !button.contains(event.target)) close(); });
  root.addEventListener('keydown', event => {
    if (!isOpen()) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const list = items();
      const next = nextMenuIndex(list.indexOf(root.activeElement), list.length, event.key);
      list[next]?.focus();
    }
  });
}

// In a test environment the global `document` may be a minimal stub that
// lacks DOM methods.  Only initialise the menu if a full document object is
// available.
if (typeof document !== 'undefined' && typeof document.getElementById === 'function') initUserMenu(document);
