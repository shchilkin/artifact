/** Starts a browser download of `blob` as `fileName`. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Some browsers read the URL after click() returns, so it is released later rather than at once.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Encodes a canvas; rejects when the browser returns no image (a full or blocked canvas). */
export function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export returned an empty image blob'));
      },
      mimeType,
      quality,
    );
  });
}
