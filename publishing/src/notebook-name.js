export const NOTEBOOK_NAME_MAX = 40;

export function normalizeNotebookName(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned.length >= 1 && cleaned.length <= NOTEBOOK_NAME_MAX ? cleaned : null;
}

export function hasDuplicateNotebookName(notebooks, name, exceptId = null) {
  return notebooks.some(item => item.id !== exceptId && item.name === name);
}