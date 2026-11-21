// Register a CSS loader for jsdom environments used in tests.
import { register } from 'node:module';

// The css-loader simply returns an empty module for any CSS import, avoiding
// side‑effects from bundlers.
register('./css-loader.mjs', import.meta.url);

// jsdom does not automatically expose a global `Element` constructor, yet
// Alpine.js expects `window.Element.prototype` to exist during module
// evaluation.  Define a minimal stub before the Alpine code runs.
// Provide an Element constructor that exists both on globalThis and on the
// `window` object used by jsdom.
globalThis.Element ??= function () {};
globalThis.document ??= {
  createElement: () => ({})
};
// Ensure the document object mimics the minimal properties used by
// prosemirror-view and other libraries.
globalThis.document.documentElement ??= { style: {} };
// Stub the XPath methods used by htmx.
globalThis.document.createExpression ??= () => ({ evaluate: () => [] });
// Provide a minimal getElementById used by main.js.
globalThis.document.getElementById ??= () => null;
// Stub event methods used by main.js.
globalThis.document.addEventListener ??= () => {};
globalThis.document.removeEventListener ??= () => {};
// Provide a minimal `location` object for htmx.
globalThis.location ??= { href: '' };
// Provide a stub for XPathEvaluator which htmx uses.
globalThis.XPathEvaluator ??= function() {};
// Provide a fallback `doc` global for libraries that reference it directly.
globalThis.doc ??= globalThis.document;
// Stub global properties used by main.js.
globalThis.innerWidth ??= 1200;
globalThis.window ??= {};
globalThis.window.Element ??= globalThis.Element;

// Provide minimal MutationObserver polyfill used by tests.
globalThis.MutationObserver ??= class {
  observe() {}
  disconnect() {}
  takeRecords() { return [] }
}

// Ensure `window` exists and contains the observer.
globalThis.window ??= {};
globalThis.window.MutationObserver ??= globalThis.MutationObserver;