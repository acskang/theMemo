import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Import the modules under test
import { loadConfig } from '../src/configLoader.js';
import { ConfigStore, } from '../src/configLoader.js';
import { applyConfig } from '../src/applyConfig.js';

// Utility to replace global.fetch during tests
function mockFetch(response) {
  global.fetch = async () => response;
}

test('loadConfig returns configuration when mode is django', async () => {
  const mockData = {
    ui_strings: { key1: 'Value1' },
    menus: [{ key: 'menu1', label: 'Menu1', url: '/m1' }],
    settings: { theme: 'dark' },
    flags: { flag1: true },
  };
  mockFetch({ ok: true, json: async () => mockData });
  const result = await loadConfig({ mode: 'django', apiBase: 'http://example.com/api' });
  assert.deepEqual(result, mockData);
});

test('loadConfig returns defaults when mode is not django', async () => {
  // Ensure fetch is not called
  global.fetch = async () => { throw new Error('fetch should not be called'); };
  const result = await loadConfig({ mode: 'demo', apiBase: 'http://example.com/api' });
  assert.deepEqual(result, {
    ui_strings: {},
    menus: [],
    settings: {},
    flags: {},
  });
});

test('applyConfig updates DOM elements correctly', async () => {
  const html = `
    <body>
      <div data-ui-string="key1">old text</div>
      <div data-ui-string="missing">fallback</div>
      <a data-menu-key="menu1" href="/old">Old Label</a>
      <a data-menu-key="missing" href="/old2">Old Label 2</a>
    </body>`;
  const dom = new JSDOM(html, { url: 'http://example.com', runScripts: 'dangerously' });
  const { window } = dom;
  // expose window to the imported modules that expect global.window
  global.window = window;
  global.document = window.document;

  const configStore = new ConfigStore({
    ui_strings: { key1: 'New Text' },
    menus: [{ key: 'menu1', label: 'New Label', url: '/new' }],
    settings: {},
    flags: {},
  });
  applyConfig(configStore);
  const uiEl = window.document.querySelector('[data-ui-string="key1"]');
  const missingEl = window.document.querySelector('[data-ui-string="missing"]');
  const menuEl = window.document.querySelector('[data-menu-key="menu1"]');
  const missingMenuEl = window.document.querySelector('[data-menu-key="missing"]');
  assert.equal(uiEl.textContent, 'New Text');
  assert.equal(missingEl.textContent, 'fallback');
  assert.equal(menuEl.textContent, 'New Label');
  assert.equal(menuEl.getAttribute('href'), '/new');
  // missing menu should not change
  assert.equal(missingMenuEl.textContent, 'Old Label 2');
  assert.equal(missingMenuEl.getAttribute('href'), '/old2');
});
