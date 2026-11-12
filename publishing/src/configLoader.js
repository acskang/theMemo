/**
 * Fetches UI configuration from the server and provides a helper class to
 * expose typed getters for UI strings, menu items, settings, and feature flags.
 *
 * The backend API is expected to return JSON in the following shape:
 * {
 *   ui_strings: { [key: string]: string },
 *   menus: [ { key: string, label: string, url?: string, icon?: string } ],
 *   settings: { [key: string]: any },
 *   flags: { [key: string]: boolean }
 * }
 */

export async function loadConfig(config) {
  if (config.mode !== 'django' || !config.apiBase) return {
    ui_strings: {},
    menus: [],
    settings: {},
    flags: {}
  };
  try {
    const base = config.apiBase.replace(/\/$/, '');
    const resp = await fetch(`${base}/config/`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!resp.ok) throw new Error(`config API error ${resp.status}`);
    const data = await resp.json();
    return data;
  } catch (e) {
    // Propagate so caller can decide to continue without config
    throw e;
  }
}

export class ConfigStore {
  constructor({ ui_strings = {}, menus = [], settings = {}, flags = {} } = {}) {
    this.uiStrings = ui_strings;
    this.menus = menus;
    this.settings = settings;
    this.flags = flags;
  }
  /**
   * Return a UI string value, falling back to the provided fallback.
   */
  getUIString(key, fallback = '') {
    return this.uiStrings[key] ?? fallback;
  }
  /**
   * Return a menu item matching the key, or null.
   */
  getMenuItem(key) {
    return this.menus.find(m => m.key === key) ?? null;
  }
  /**
   * Return a setting value, falling back to the provided fallback.
   */
  getSetting(key, fallback = '') {
    return this.settings[key] ?? fallback;
  }
  /**
   * Return a feature flag value, defaulting to fallback if not present.
   */
  getFeatureFlag(key, fallback = false) {
    const val = this.flags[key];
    if (typeof val === 'boolean') return val;
    return fallback;
  }
}
