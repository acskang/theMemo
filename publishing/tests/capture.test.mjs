import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, finalTranscript, speechErrorMessage, speechCtor, downscaleImage } from '../src/capture.js';

test('fitSize keeps small photos and scales large ones to the longest edge', () => {
  assert.deepEqual(fitSize(1000, 800), { width: 1000, height: 800 });
  assert.deepEqual(fitSize(4000, 3000), { width: 2048, height: 1536 });
  assert.deepEqual(fitSize(3000, 4000), { width: 1536, height: 2048 });
  assert.deepEqual(fitSize(0, 10), { width: 0, height: 0 });
});

test('finalTranscript returns only new final results', () => {
  const result = (text, isFinal) => Object.assign([{ transcript: text }], { isFinal });
  const event = { resultIndex: 1, results: [result('이미 처리됨', true), result(' 안녕하세요 ', true), result('중간 결과', false)] };
  assert.equal(finalTranscript(event), '안녕하세요');
  assert.equal(finalTranscript({ results: [result('가', true), result('나', true)] }), '가나');
});

test('speech helpers: support detection and error messages', () => {
  assert.equal(speechCtor({}), null);
  const Fake = function () {};
  assert.equal(speechCtor({ webkitSpeechRecognition: Fake }), Fake);
  assert.match(speechErrorMessage('not-allowed'), /마이크 권한/);
  assert.equal(speechErrorMessage('no-speech'), '');
});

test('downscaleImage passes through non-resizable files', async () => {
  const gif = { type: 'image/gif', size: 10 };
  assert.equal(await downscaleImage(gif), gif);
  assert.equal(await downscaleImage(null), null);
});
