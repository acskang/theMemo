// 스마트폰 카메라 촬영·음성 입력을 위한 순수 보조 함수 (DOM 없이 테스트 가능).
export const MAX_PHOTO_EDGE = 2048;

export function fitSize(width, height, max = MAX_PHOTO_EDGE) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// 휴대폰 카메라 사진(수 MB)을 업로드 한도에 맞게 JPEG로 줄인다. 실패하면 원본을 그대로 돌려준다.
export async function downscaleImage(file, { max = MAX_PHOTO_EDGE, quality = 0.85 } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitSize(bitmap.width, bitmap.height, max);
    if (!width) return file;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height); bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || (blob.size >= file.size && width === bitmap.width)) return file;
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    return new File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch { return file; }
}

export function speechCtor(win = globalThis) {
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

// 인식 결과 중 확정된 문장만 모아 한 덩어리로 만든다. (resultIndex 이전 결과는 이미 처리됨)
export function finalTranscript(event) {
  let text = '';
  for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
    const result = event.results[i];
    if (result.isFinal) text += result[0].transcript;
  }
  return text.trim();
}

export function speechErrorMessage(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return '마이크 권한이 필요해요. 브라우저 설정에서 마이크를 허용해 주세요.';
  if (code === 'audio-capture') return '마이크를 찾을 수 없어요.';
  if (code === 'network') return '음성 인식 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.';
  if (code === 'language-not-supported') return '이 기기는 한국어 음성 인식을 지원하지 않아요.';
  return '';
}
