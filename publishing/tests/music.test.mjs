import test from 'node:test';
import assert from 'node:assert/strict';
import { clampVolume, loadVolume, saveVolume, validateMusicFile, trackLabel } from '../src/music.js';

test('clampVolume keeps volume between 0 and 1', () => {
  assert.equal(clampVolume(2), 1);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume('0.3'), 0.3);
  assert.equal(clampVolume('abc'), 0.5);
});

test('volume persists through storage and tolerates missing/broken storage', () => {
  const data = {}; const storage = { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
  assert.equal(loadVolume(storage), 0.5);
  saveVolume(0.8, storage);
  assert.equal(loadVolume(storage), 0.8);
  assert.equal(loadVolume({ getItem() { throw new Error('blocked'); } }), 0.5);
  assert.doesNotThrow(() => saveVolume(0.2, { setItem() { throw new Error('blocked'); } }));
});

test('validateMusicFile checks extension, emptiness and size', () => {
  assert.equal(validateMusicFile({ name: '노래.MP3', size: 1000 }), '');
  assert.match(validateMusicFile({ name: 'a.exe', size: 10 }), /음악 파일만/);
  assert.match(validateMusicFile({ name: 'a.mp3', size: 0 }), /빈 파일/);
  assert.match(validateMusicFile({ name: 'a.mp3', size: 31 * 1024 * 1024 }), /30MB/);
  assert.match(validateMusicFile(null), /선택/);
});

test('trackLabel strips the extension', () => {
  assert.equal(trackLabel('내 노래.mp3'), '내 노래');
  assert.equal(trackLabel(''), '배경음악');
});
