import { type RefObject, useEffect, useRef, useState } from 'react';
import type { WebSession } from '../src';
import { renderProject } from '../src/render';
import { RenderJobs } from '../src/renderJobs';

export const PREVIEW_SIZE = 1000;
const EXPORT_SIZE = 3000;

async function renderPNG(session: WebSession, size: number, signal: AbortSignal) {
  const start = performance.now();
  const canvas = await renderProject(session, size, signal);
  signal.throwIfAborted();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
  signal.throwIfAborted();
  performance.measure(`artifact-pilot:${size === PREVIEW_SIZE ? 'preview' : 'export'}`, { start });
  return blob;
}

export function useArtwork(session: RefObject<WebSession | null>, revision: unknown) {
  const jobs = useRef(new RenderJobs());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [artwork, setArtwork] = useState({ url: '', error: '', revision: undefined as unknown });

  // Invalidate synchronously at document mutations, before React effect cleanup.
  function invalidate() {
    jobs.current.invalidate();
    setExporting(false);
    setExportError('');
  }

  useEffect(() => {
    const current = session.current;
    if (!current) return;
    let url = '';
    const owner = jobs.current;
    void owner.run(
      'preview',
      (signal) => renderPNG(current, PREVIEW_SIZE, signal),
      (blob) => {
        url = URL.createObjectURL(blob);
        setArtwork({ url, error: '', revision });
      },
      (error) => setArtwork({ url: '', error: String(error), revision }),
    );
    return () => {
      owner.cancel('preview');
      if (url) URL.revokeObjectURL(url);
    };
  }, [session, revision]);

  useEffect(() => {
    const owner = jobs.current;
    return () => owner.invalidate();
  }, []);

  function exportPNG(name: string) {
    const current = session.current;
    if (!current || exporting) return;
    setExporting(true);
    setExportError('');
    void jobs.current.run(
      'export',
      (signal) => renderPNG(current, EXPORT_SIZE, signal),
      (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name.replace(/\.artifact$/, '')}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      (error) => setExportError(String(error)),
      () => setExporting(false),
    );
  }

  const visible =
    artwork.revision === revision ? { ...artwork, busy: false } : { url: '', error: '', busy: Boolean(revision) };
  return { ...visible, exporting, exportError, exportPNG, invalidate };
}
