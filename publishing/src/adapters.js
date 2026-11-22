/** Persistence boundary. UI/editor modules must not know Django routes or IndexedDB. */
import { defaultNotebooks, sampleNotes } from './sample-data.js';
export class StoreError extends Error {
  constructor(message, code = 'storage_error') { super(message); this.code = code; }
}
export function createAdapter(config) {
  if (config.mode === 'demo') return new BrowserAdapter(config);
  if (config.mode === 'django' && config.apiBase) return new DjangoAdapter(config);
  throw new StoreError('저장 방식 설정을 확인해 주세요. mode와 apiBase가 필요합니다.', 'configuration');
}
const clone = value => structuredClone(value);

class BrowserAdapter {
  constructor(config) { this.config = config; this.mode = 'demo'; }
  async init() {
    if (!globalThis.indexedDB) throw new StoreError('이 브라우저에서는 임시 저장소를 사용할 수 없어요.');
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.config.storageKey, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('notes', { keyPath: 'id' });
        req.result.createObjectStore('notebooks', { keyPath: 'id' });
        req.result.createObjectStore('settings', { keyPath: 'id' });
      };
      req.onerror = () => reject(new StoreError('브라우저 저장소를 열지 못했어요.'));
      req.onsuccess = () => resolve(req.result);
    });
    this.db.onversionchange = () => this.db.close();
    // A single transaction makes first-run seeding atomic across tabs.
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(['settings', 'notes', 'notebooks'], 'readwrite');
      const marker = tx.objectStore('settings').get('initialized');
      marker.onsuccess = () => {
        if (marker.result) return;
        defaultNotebooks.forEach(item => tx.objectStore('notebooks').put(item));
        sampleNotes(this.config.assetBase).forEach(item => tx.objectStore('notes').put(item));
        tx.objectStore('settings').put({ id: 'initialized', value: true });
      };
      tx.oncomplete = resolve; tx.onabort = () => reject(new StoreError('처음 메모를 준비하지 못했어요.'));
    });
  }
  /** Stub for imageInfo – demo adapter does not support it */
  async imageInfo() { return null; }
  /** Stub for renameImage – demo adapter does not support it */
  async renameImage() { return null; }
  async all(store) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new StoreError('목록을 읽지 못했어요.'));
    });
  }
  async list() { return this.all('notes'); }
  async cards() { return null; }
  async notebooks() { return this.all('notebooks'); }
  async save(note) {
    return new Promise((resolve, reject) => {
      let saved; let problem;
      const tx = this.db.transaction('notes', 'readwrite'); const store = tx.objectStore('notes');
      const req = store.get(note.id);
      req.onsuccess = () => {
        const previous = req.result;
        if ((previous?.revision ?? 0) !== note.revision) {
          problem = new StoreError('다른 탭에서 수정된 기록이에요. 현재 내용을 JSON으로 보관한 뒤 다시 열어 주세요.', 'conflict'); tx.abort(); return;
        }
        saved = { ...clone(note), revision: (previous?.revision ?? 0) + 1, updated_at: new Date().toISOString() };
        store.put(saved);
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = () => reject(problem ?? new StoreError('이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.'));
      tx.onerror = () => {}; // onabort handles one rejection.
    });
  }
  async addNotebook(name) {
    const item = { id: crypto.randomUUID(), name };
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction('notebooks', 'readwrite'); tx.objectStore('notebooks').add(item);
      tx.oncomplete = resolve; tx.onabort = () => reject(new StoreError('메모장을 추가하지 못했어요.'));
    });
    return item;
  }
  async renameNotebook(id, name) {
    const tx = this.db.transaction('notebooks', 'readwrite');
    const store = tx.objectStore('notebooks');
    const req = store.get(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const existing = req.result;
        if (!existing) {
          reject(new StoreError('메모장을 찾을 수 없어요.', 'not_found'));
          return;
        }
        if (existing.name === name) {
          resolve({ id, name });
          return;
        }
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const dup = getAllReq.result.find(item => item.name === name && item.id !== id);
          if (dup) {
            reject(new StoreError('같은 이름의 메모장이 이미 있어요.', 'duplicate'));
            return;
          }
          existing.name = name;
          const putReq = store.put(existing);
          putReq.onsuccess = () => resolve({ id, name });
          putReq.onerror = () => reject(new StoreError('저장 실패', 'storage_error'));
        };
        getAllReq.onerror = () => reject(new StoreError('데이터베이스 접근 실패', 'storage_error'));
      };
      req.onerror = () => reject(new StoreError('데이터베이스 접근 실패', 'storage_error'));
    });
  }
  async deleteNotebook(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes', 'notebooks'], 'readwrite');
      const notebooks = tx.objectStore('notebooks'); const notes = tx.objectStore('notes');
      let result; let problem;
      const targetRequest = notebooks.get(id);
      targetRequest.onsuccess = () => {
        const target = targetRequest.result;
        if (!target) { problem = new StoreError('메모장을 찾을 수 없어요.', 'not_found'); tx.abort(); return; }
        if (target.name === '일상 기록') { problem = new StoreError('기본 메모장인 일상 기록은 삭제할 수 없어요.', 'default_notebook'); tx.abort(); return; }
        const allRequest = notebooks.getAll();
        allRequest.onsuccess = () => {
          const fallback = allRequest.result.find(item => item.name === '일상 기록');
          if (!fallback) { problem = new StoreError('일상 기록 메모장을 찾을 수 없어요.', 'not_found'); tx.abort(); return; }
          const noteRequest = notes.getAll();
          noteRequest.onsuccess = () => {
            let moved = 0;
            noteRequest.result.forEach(note => { if (note.notebook_id === id) { note.notebook_id = fallback.id; notes.put(note); moved++; } });
            notebooks.delete(id); result = { deleted_id: id, fallback_notebook: fallback, moved_count: moved };
          };
        };
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(problem ?? new StoreError('메모장을 삭제하지 못했어요.'));
    });
  }
  async uploadFile() { throw new StoreError('파일 첨부는 서버에 연결된 환경에서만 사용할 수 있어요.'); }
  async uploadMusic() { throw new StoreError('배경음악은 서버에 연결된 환경에서만 사용할 수 있어요.'); }
  async deleteMusic() { throw new StoreError('배경음악은 서버에 연결된 환경에서만 사용할 수 있어요.'); }
  async upload(file) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new StoreError('JPG, PNG, WebP, GIF 사진을 선택해 주세요.');
    if (file.size > 5 * 1024 * 1024) throw new StoreError('데모에서는 5MB 이하의 사진을 사용할 수 있어요.');
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new StoreError('사진을 읽지 못했어요.')); reader.readAsDataURL(file);
    });
    return { url: src, original_name: file.name };
  }
  async importImage(url) {
    let response;
    try { response = await fetch(url, { credentials: 'omit' }); } catch { throw new StoreError('외부 이미지를 가져오지 못했어요.', 'image_import_failed'); }
    if (!response.ok) throw new StoreError('외부 이미지를 가져오지 못했어요.', 'image_import_failed');
    const blob = await response.blob();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(blob.type) || blob.size > 5 * 1024 * 1024) throw new StoreError('가져온 이미지 형식을 확인해 주세요.', 'image_import_failed');
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new StoreError('이미지를 읽지 못했어요.')); reader.readAsDataURL(blob);
    });
    return { url: src, original_name: 'external-image' };
  }
  close() { this.db?.close(); }
}

/** Django contract is described in docs/DJANGO_INTEGRATION.md. Never silently falls back to demo. */
class DjangoAdapter {
  constructor(config) { this.config = config; this.mode = 'django'; this.base = config.apiBase.replace(/\/$/, ''); }
  async init() {}
  csrf() {
    const input = document.querySelector('[name=csrfmiddlewaretoken]');
    if (input) return input.value;
    const match = document.cookie.split('; ').find(v => v.startsWith('csrftoken='));
    return match ? decodeURIComponent(match.slice('csrftoken='.length)) : '';
  }
  async request(path, options = {}) {
    const headers = { Accept: 'application/json', ...options.headers };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET') headers['X-CSRFToken'] = this.csrf();
    let response;
    try { response = await fetch(`${this.base}${path}`, { ...options, headers, credentials: 'same-origin', redirect: 'error' }); }
    catch { throw new StoreError('서버에 연결하지 못했어요. 내용을 유지하고 다시 저장해 주세요.', 'network'); }
    let data;
    try { data = await response.json(); } catch {
      if (response.ok) throw new StoreError('서버 응답 형식을 확인해 주세요.', 'response');
    }
    if (response.status === 401 || response.status === 403) throw new StoreError('로그인 또는 저장 권한을 확인해 주세요. 현재 내용은 화면에 유지됩니다.', 'auth');
    if (response.status === 409) throw new StoreError('다른 기기에서 수정됐어요. 현재 내용을 JSON으로 보관한 뒤 다시 열어 주세요.', 'conflict');
    if (!response.ok) throw new StoreError(data?.error?.message || (typeof data?.detail === 'string' ? data.detail : null) || `요청을 완료하지 못했어요. (${response.status})`, data?.error?.code || 'http');
    return data;
  }
  async list() { const data = await this.request('/notes/'); return data.items; }
  async cards(params = {}) { const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)); return this.request(`/cards/?${query}`); }
  async notebooks() { const data = await this.request('/notebooks/'); return data.items; }
  async save(note) { return this.request(`/notes/${encodeURIComponent(note.id)}/`, { method: 'PUT', body: JSON.stringify(note) }); }
  async addNotebook(name) { return this.request('/notebooks/', { method: 'POST', body: JSON.stringify({ name }) }); }
  async renameNotebook(id, name) { return this.request(`/notebooks/${encodeURIComponent(id)}/rename/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); }
  async deleteNotebook(id) { return this.request(`/notebooks/${encodeURIComponent(id)}/delete/`, { method: 'DELETE' }); }
  async upload(file) { const body = new FormData(); body.append('file', file); return this.request('/images/', { method: 'POST', body }); }
  async uploadFile(file) { const body = new FormData(); body.append('file', file); return this.request('/files/', { method: 'POST', body }); }
  async uploadMusic(noteId, file) { const body = new FormData(); body.append('file', file); return this.request(`/notes/${encodeURIComponent(noteId)}/music/`, { method: 'POST', body }); }
  async deleteMusic(noteId) { return this.request(`/notes/${encodeURIComponent(noteId)}/music/`, { method: 'DELETE' }); }
  async importImage(url) { return this.request('/images/import/', { method: 'POST', body: JSON.stringify({ url }) }); }
  /**
   * Retrieve image metadata from the server.
   *
   * @param {string} id - The UUID of the image.
   * @returns {Promise<object>} The JSON response containing id, url, original_name.
   */
  async imageInfo(id) { return this.request(`/images/${encodeURIComponent(id)}/`); }
  /**
   * Rename the image on the server.
   *
   * @param {string} id - The UUID of the image.
   * @param {string} name - The new name to set.
   * @returns {Promise<object>} The JSON response containing updated fields.
   */
  async renameImage(id, name) { return this.request(`/images/${encodeURIComponent(id)}/`, { method: 'PATCH', body: JSON.stringify({ name }) }); }
  close() {}
}
