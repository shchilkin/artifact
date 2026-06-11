export type CapabilityState = 'ready' | 'limited' | 'blocked';

export interface BrowserCapabilityReport {
  localSave: CapabilityState;
  projectStorage: CapabilityState;
  canvas: CapabilityState;
  webgl: CapabilityState;
  downloads: CapabilityState;
  fileOpen: CapabilityState;
  offlineShell: CapabilityState;
}

interface CapabilityGlobal {
  document?: {
    createElement?: (tagName: string) => unknown;
  };
  indexedDB?: unknown;
  localStorage?: StorageLike;
  navigator?: {
    serviceWorker?: unknown;
  };
  HTMLAnchorElement?: {
    prototype?: object;
  };
  File?: unknown;
  FileReader?: unknown;
}

interface StorageLike {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CanvasLike {
  getContext?(contextId: string): unknown;
}

const TEST_KEY = '__artifact_capability_probe__';

export function detectBrowserCapabilities(scope: CapabilityGlobal = globalThis): BrowserCapabilityReport {
  const localSave = canUseLocalStorage(scope.localStorage) ? 'ready' : 'blocked';
  const projectStorage = scope.indexedDB ? 'ready' : 'blocked';
  const canvas = canCreateCanvasContext(scope, '2d') ? 'ready' : 'blocked';
  const webgl = canCreateCanvasContext(scope, 'webgl2') || canCreateCanvasContext(scope, 'webgl') ? 'ready' : 'limited';
  const downloads = hasDownloadAttribute(scope) ? 'ready' : 'limited';
  const fileOpen = scope.File && scope.FileReader ? 'ready' : 'limited';
  const offlineShell = scope.navigator?.serviceWorker ? 'ready' : 'limited';

  return {
    localSave,
    projectStorage,
    canvas,
    webgl,
    downloads,
    fileOpen,
    offlineShell,
  };
}

function canUseLocalStorage(storage: StorageLike | undefined) {
  if (!storage) return false;
  try {
    storage.setItem(TEST_KEY, '1');
    storage.removeItem(TEST_KEY);
    return true;
  } catch {
    return false;
  }
}

function canCreateCanvasContext(scope: CapabilityGlobal, contextId: string) {
  try {
    const canvas = scope.document?.createElement?.('canvas') as CanvasLike | undefined;
    return Boolean(canvas?.getContext?.(contextId));
  } catch {
    return false;
  }
}

function hasDownloadAttribute(scope: CapabilityGlobal) {
  return Boolean(scope.HTMLAnchorElement?.prototype && 'download' in scope.HTMLAnchorElement.prototype);
}
