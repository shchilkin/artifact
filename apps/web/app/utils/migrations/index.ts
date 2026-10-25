import { DOCUMENT_SCHEMA_VERSION } from '../../types/config';
import type { StoredDocument } from './shared';
import { migrateV1ToV2 } from './v1ToV2';
import { migrateV2ToV3 } from './v2ToV3';
import { migrateV3ToV4 } from './v3ToV4';
import { migrateV4ToV5 } from './v4ToV5';
import { migrateV5ToV6 } from './v5ToV6';
import { migrateV6ToV7 } from './v6ToV7';
import { migrateV7ToV8 } from './v7ToV8';
import { migrateV8ToV9 } from './v8ToV9';
import { migrateV9ToV10 } from './v9ToV10';
import { migrateV10ToV11 } from './v10ToV11';
import { migrateV11ToV12 } from './v11ToV12';
import { migrateV12ToV13 } from './v12ToV13';
import { migrateV13ToV14 } from './v13ToV14';
import { migrateV14ToV15 } from './v14ToV15';
import { migrateV15ToV16 } from './v15ToV16';
import { migrateV16ToV17 } from './v16ToV17';

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
  4: migrateV4ToV5,
  5: migrateV5ToV6,
  6: migrateV6ToV7,
  7: migrateV7ToV8,
  8: migrateV8ToV9,
  9: migrateV9ToV10,
  10: migrateV10ToV11,
  11: migrateV11ToV12,
  12: migrateV12ToV13,
  13: migrateV13ToV14,
  14: migrateV14ToV15,
  15: migrateV15ToV16,
  16: migrateV16ToV17,
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
