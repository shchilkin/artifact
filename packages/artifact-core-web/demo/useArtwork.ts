import { type RefObject, useEffect, useState } from 'react';
import type { WebSession } from '../src';
import { renderProject } from '../src/render';

export function useArtwork(session: RefObject<WebSession | null>, revision: unknown) {
  const [artwork, setArtwork] = useState<{ url: string; error: string; busy: boolean; revision?: unknown }>({
    url: '',
    error: '',
    busy: false,
  });
  useEffect(() => {
    void revision;
    const current = session.current;
    if (!current) return;
    const controller = new AbortController();
    let url = '';
    void renderProject(current, 3000, controller.signal)
      .then(
        (canvas) =>
          new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'),
          ),
      )
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setArtwork({ url, error: '', busy: false, revision });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setArtwork({ url: '', error: String(error), busy: false, revision });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [session, revision]);
  return artwork.revision === revision ? artwork : { url: '', error: '', busy: Boolean(revision) };
}
