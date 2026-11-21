import test from 'node:test';
import assert from 'node:assert/strict';
import { imageIdFromSrc, normalizeImageName, IMAGE_NAME_MAX } from '../src/image-name.js';

test('imageIdFromSrc: 내부 이미지 주소에서 id 추출', () => {
  assert.equal(imageIdFromSrc('/memo-media/123e4567-e89b-12d3-a456-426614174000/'), '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(imageIdFromSrc('https://memo.example.com/memo-media/123E4567-E89B-12D3-A456-426614174000/'), '123e4567-e89b-12d3-a456-426614174000');
});

test('imageIdFromSrc: 그 밖의 주소는 null', () => {
  assert.equal(imageIdFromSrc('https://example.com/a.png'), null);
  assert.equal(imageIdFromSrc('data:image/png;base64,AAAA'), null);
  assert.equal(imageIdFromSrc('/memo-media/not-a-uuid/'), null);
  assert.equal(imageIdFromSrc(''), null);
  assert.equal(imageIdFromSrc(null), null);
});

test('normalizeImageName: 공백 정리와 길이 제한', () => {
  assert.equal(normalizeImageName('  쪽대밭   강남  '), '쪽대밭 강남');
  assert.equal(normalizeImageName('a\tb\nc'), 'a b c');
  assert.equal(normalizeImageName(''), null);
  assert.equal(normalizeImageName('   '), null);
  assert.equal(normalizeImageName('x'.repeat(IMAGE_NAME_MAX)), 'x'.repeat(IMAGE_NAME_MAX));
  assert.equal(normalizeImageName('x'.repeat(IMAGE_NAME_MAX + 1)), null);
});