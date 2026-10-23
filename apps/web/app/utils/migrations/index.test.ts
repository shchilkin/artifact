import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION } from '../../types/config';
import { MIGRATIONS, migrateDocument, storedSchemaVersion } from '.';

describe('migrateDocument', () => {
  it('registers one step for every schema version below the current one', () => {
    const versions = Object.keys(MIGRATIONS).map(Number);
    expect(versions).toEqual(Array.from({ length: DOCUMENT_SCHEMA_VERSION - 1 }, (_, index) => index + 1));
  });

  it.each(Object.entries(MIGRATIONS))('step from schema %s raises schemaVersion by one', (from, step) => {
    expect(step({ schemaVersion: Number(from), layers: [] }).schemaVersion).toBe(Number(from) + 1);
  });

  it('runs every step for documents without a schema version', () => {
    expect(migrateDocument({ layers: [] }).schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
  });

  it('leaves current-schema documents untouched', () => {
    const doc = { schemaVersion: DOCUMENT_SCHEMA_VERSION, layers: [{ id: 'a', kind: 'source', sourceType: 'noise' }] };
    expect(migrateDocument(doc)).toBe(doc);
  });

  it('rejects documents from a newer build', () => {
    expect(() => migrateDocument({ schemaVersion: DOCUMENT_SCHEMA_VERSION + 1 })).toThrow(
      /Unsupported document schema version/,
    );
  });

  it('reads invalid or fractional versions conservatively', () => {
    expect(storedSchemaVersion({ schemaVersion: 2.7 })).toBe(2);
    expect(storedSchemaVersion({ schemaVersion: 0 })).toBe(1);
    expect(storedSchemaVersion({ schemaVersion: Number.NaN })).toBe(1);
    expect(storedSchemaVersion({ schemaVersion: '3' })).toBe(1);
  });
});
