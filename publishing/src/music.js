// 메모별 배경음악: DOM과 무관한 순수 보조 함수.
export const MUSIC_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i;
export const MUSIC_MAX_BYTES = 30 * 1024 * 1024;
export const MUSIC_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.weba';
const VOLUME_KEY = 'smartmemo-music-volume';

export function clampVolume(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

export function loadVolume(storage = globalThis.localStorage) {
  try { const raw = storage?.getItem(VOLUME_KEY); return raw === null || raw === undefined ? 0.5 : clampVolume(raw); } catch { return 0.5; }
}

export function saveVolume(value, storage = globalThis.localStorage) {
  try { storage?.setItem(VOLUME_KEY, String(clampVolume(value))); } catch {}
}

// 올리기 전에 브라우저에서 먼저 확인한다. 문제가 없으면 빈 문자열.
export function validateMusicFile(file) {
  if (!file) return '음악 파일을 선택해 주세요.';
  if (!MUSIC_EXT.test(file.name || '')) return 'MP3, M4A, AAC, OGG, WAV, FLAC 음악 파일만 등록할 수 있어요.';
  if (!file.size) return '빈 파일은 등록할 수 없어요.';
  if (file.size > MUSIC_MAX_BYTES) return '음악 파일은 30MB 이하만 등록할 수 있어요.';
  return '';
}

export function trackLabel(name = '') {
  return String(name).replace(MUSIC_EXT, '') || '배경음악';
}
