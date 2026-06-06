import { describe, expect, it } from 'vitest';

import { detectBrowserCapabilities } from './browserCapabilities';

function storage() {
  const values = new Map<string, string>();
  return {
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function documentWithContext(contexts: Record<string, boolean>) {
  return {
    createElement: () => ({
      getContext: (name: string) => (contexts[name] ? {} : null),
    }),
  };
}

describe('detectBrowserCapabilities', () => {
  it('reports ready states when browser APIs are available', () => {
    const report = detectBrowserCapabilities({
      localStorage: storage(),
      indexedDB: {},
      navigator: { serviceWorker: {} },
      HTMLAnchorElement: { prototype: { download: '' } },
      File: function File() {},
      FileReader: function FileReader() {},
      document: documentWithContext({ '2d': true, webgl2: true }),
    });

    expect(report).toEqual({
      localSave: 'ready',
      projectStorage: 'ready',
      canvas: 'ready',
      webgl: 'ready',
      downloads: 'ready',
      fileOpen: 'ready',
      offlineShell: 'ready',
    });
  });

  it('keeps the app usable but warns when optional APIs are absent', () => {
    const report = detectBrowserCapabilities({
      localStorage: {
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => undefined,
      },
      document: documentWithContext({ '2d': true }),
    });

    expect(report).toMatchObject({
      localSave: 'blocked',
      projectStorage: 'blocked',
      canvas: 'ready',
      webgl: 'limited',
      downloads: 'limited',
      fileOpen: 'limited',
      offlineShell: 'limited',
    });
  });
});
