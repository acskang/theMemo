/**
 * Helper to apply configuration values to DOM elements.
 * This file is a thin wrapper used only for unit testing to avoid pulling in
 * CSS imports from `main.js`.
 */
export function applyConfig(config) {
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