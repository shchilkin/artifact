export function normalizeOriginValue(value: string) {
  const trimmed = value.trim().replace(/\/$/, '');
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {
    // Keep the original value so the allow-list check can reject it.
  }
  return trimmed;
}
