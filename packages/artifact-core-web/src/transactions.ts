import type { WebSession } from '../generated/artifact_wasm';

/** Version 1. The session owns the only durable history for this document. */
export const COMMAND_VERSION = 1 as const;

export type SharedCommand =
  | { type: 'patch_layer'; id: string; patch: Record<string, unknown> }
  | { type: 'patch_layers'; ids: string[]; patch: Record<string, unknown> }
  | { type: 'patch_global'; patch: { aspect?: '1:1' | '4:5' | '9:16' | '16:9'; bg?: string; seed?: number } }
  | { type: 'patch_export'; patch: { format?: 'png' | 'jpeg'; scale?: 1 | 2 | 3; target?: 'cover' } }
  | {
      type: 'add_layer';
      kind: 'text' | 'image' | 'fill' | 'emoji' | 'effect';
      new_id: string;
      after_id?: string;
      src?: unknown;
    }
  | { type: 'duplicate_layer'; id: string; new_id: string }
  | { type: 'remove_layer'; id: string }
  | { type: 'move_layer'; id: string; delta: -1 | 1 }
  | {
      type: 'bridge_structure';
      capability: 'web:structure';
      layers: unknown[];
      graph: { present: false; value?: null } | { present: true; value: unknown };
    }
  | {
      type: 'bridge';
      capability: 'web:graph';
      target: { scope: 'graph' };
      value?: unknown;
      remove?: boolean;
    }
  | {
      type: 'bridge';
      capability: 'web:layer-property';
      target: { scope: 'layer_field'; id: string; field: string };
      value?: unknown;
      remove?: boolean;
    }
  | {
      type: 'bridge';
      capability: 'web:export-envmap';
      target: { scope: 'export_field'; field: 'target' };
      value: 'envmap';
    };

export interface SharedChanges {
  layers: Record<string, string[]>;
  global: string[];
  export: string[];
  graph: boolean;
  order: boolean;
}

export interface SharedResult {
  version: typeof COMMAND_VERSION;
  ok: boolean;
  revision: number;
  draftRevision: number;
  transactionId: number | null;
  changed: boolean;
  changes: SharedChanges;
  error: { code: string; message: string } | null;
}

export function beginTransaction(session: WebSession, expectedRevision: number | bigint): SharedResult {
  const revision = Number(expectedRevision);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new RangeError('Revision exceeds the JSON command range');
  return JSON.parse(
    session.begin_transaction_json(JSON.stringify({ version: COMMAND_VERSION, expectedRevision: revision })),
  );
}

export function updateTransaction(session: WebSession, transactionId: number, commands: SharedCommand[]): SharedResult {
  return JSON.parse(
    session.update_transaction_json(JSON.stringify({ version: COMMAND_VERSION, transactionId, commands })),
  );
}

export function commitTransaction(session: WebSession, transactionId: number): SharedResult {
  return JSON.parse(session.commit_transaction_json(JSON.stringify({ version: COMMAND_VERSION, transactionId })));
}

export function cancelTransaction(session: WebSession, transactionId: number): SharedResult {
  return JSON.parse(session.cancel_transaction_json(JSON.stringify({ version: COMMAND_VERSION, transactionId })));
}
