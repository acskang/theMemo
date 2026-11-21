export const IMAGE_NAME_MAX = 255;

/**
 * Extract the image UUID from a memo-media URL.
 * Supports absolute URLs and relative paths.
 * Returns null if no valid UUID is found.
 */
export function imageIdFromSrc(src) {
  const match = /^(?:https?:\/\/[^/]+)?\/memo-media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i.exec(String(src ?? ''));
  return match ? match[1].toLowerCase() : null;
}

/**
 * Normalize an image name.
 * Trims leading/trailing whitespace, collapses multiple internal
 * whitespace sequences into a single space, and ensures the name is
 * between 1 and IMAGE_NAME_MAX characters.
 */
export function normalizeImageName(value) {
  const cleaned = String(value ?? '').split(/\s+/).filter(Boolean).join(' ');
  return cleaned.length >= 1 && cleaned.length <= IMAGE_NAME_MAX ? cleaned : null;
}
