import { DOCUMENT_SCHEMA_VERSION } from '../../types/config';
import type { StoredDocument } from './shared';
import { migrateV1ToV2 } from './v1ToV2';
import { migrateV2ToV3 } from './v2ToV3';
import { migrateV3ToV4 } from './v3ToV4';

export type { StoredDocument } from './shared';

/**
 * One-shot schema migrations, keyed by the version they upgrade from. Each step runs once, raises `schemaVersion`
 * by one, and never runs on documents already at a newer version. A document without `schemaVersion` is schema 1.
 *
 * To change the stored format: bump `DOCUMENT_SCHEMA_VERSION`, add `vNToVN+1.ts` with a fixture test, and register
 * it here. Do not add legacy-format branches to `normalizeDocument`.
 */
export const MIGRATIONS: Readonly<Record<number, (doc: StoredDocument) => StoredDocument>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
};

export function storedSchemaVersion(doc: StoredDocument): number {
  return typeof doc.schemaVersion === 'number' && Number.isFinite(doc.schemaVersion)
    ? Math.max(1, Math.floor(doc.schemaVersion))
    : 1;
}

export function migrateDocument(raw: StoredDocument): StoredDocument {
  const from = storedSchemaVersion(raw);
  if (from > DOCUMENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported document schema version ${from}; this build supports up to ${DOCUMENT_SCHEMA_VERSION}.`,
    );
  }
  let doc = raw;
  for (let version = from; version < DOCUMENT_SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`Missing document migration from schema ${version}`);
    doc = step(doc);
  }
  return doc;
}
