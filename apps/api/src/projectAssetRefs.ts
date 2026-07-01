import type { JsonValue } from './db/types.js';

const CLOUD_ASSET_URI_PREFIX = 'artifact-cloud-asset://';
const CLOUD_ASSET_KINDS = new Set(['image', 'font', 'model', 'environment']);

export function collectCloudProjectAssetIds(value: JsonValue): Set<string> {
  const ids = new Set<string>();
  collectCloudProjectAssetIdsInto(value, ids);
  return ids;
}

function collectCloudProjectAssetIdsInto(value: JsonValue, ids: Set<string>): void {
  if (typeof value === 'string') {
    const asset = parseCloudAssetUri(value);
    if (asset) ids.add(asset.id);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectCloudProjectAssetIdsInto(item, ids);
    return;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectCloudProjectAssetIdsInto(item, ids);
  }
}

function parseCloudAssetUri(value: string): { id: string } | null {
  if (!value.startsWith(CLOUD_ASSET_URI_PREFIX)) return null;
  const [kind, id] = value.slice(CLOUD_ASSET_URI_PREFIX.length).split('/');
  if (!kind || !id || !CLOUD_ASSET_KINDS.has(kind)) return null;
  return { id };
}
