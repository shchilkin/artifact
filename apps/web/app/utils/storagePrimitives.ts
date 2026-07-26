export function randomStorageId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function estimateDataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return dataUrl.length;
  return Math.round((dataUrl.length - comma - 1) * 0.75);
}

export function dataUrlMime(dataUrl: string, fallback = 'application/octet-stream') {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] ?? fallback;
}

export async function blobToBase64DataUrl(blob: Blob, fallbackMime = 'application/octet-stream'): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return `data:${blob.type || fallbackMime};base64,${btoa(binary)}`;
}
