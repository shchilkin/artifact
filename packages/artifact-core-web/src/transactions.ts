import type { WebSession } from '../generated/artifact_wasm';

/** Version 1. The session owns the only durable history for this document. */
export const COMMAND_VERSION = 1 as const;

export type SharedGraphAction =
  | {
      kind: 'add_node';
      collection: 'merge' | 'color' | 'repeat' | 'mask' | 'transform' | 'grimeShadow';
      node: Record<string, unknown>;
      position: { x: number; y: number };
    }
  | { kind: 'patch_node'; id: string; patch: Record<string, unknown> }
  | { kind: 'remove_nodes'; ids: string[] }
  | { kind: 'duplicate_nodes'; copies: { id: string; new_id: string }[] }
  | { kind: 'set_positions'; positions: Record<string, { x: number; y: number }> }
  | { kind: 'add_edge'; edge: { id: string; fromId: string; fromPort: 'out'; toId: string; toPort: string } }
  | { kind: 'remove_edges'; ids: string[] }
  | { kind: 'reconnect_edge'; id: string; from_id: string; to_id: string; to_port: string }
  | { kind: 'split_edge'; id: string; node_id: string; input_port: string }
  | { kind: 'add_area'; area: Record<string, unknown> }
  | { kind: 'patch_area'; id: string; patch: Record<string, unknown> }
  | { kind: 'remove_area'; id: string }
  | { kind: 'assign_area'; id: string; node_ids: string[] };

export interface SharedGraphPlan {
  mode: 'stack' | 'graph';
  targetId: string;
  dependencyNodeIds: string[];
  dependencyEdgeIds: string[];
  dependencyEdges: Array<{ id: string; fromId: string; fromPort: string; toId: string; toPort: string }>;
  downstreamNodeIds: string[];
  renderLayerIds: string[];
  editorLayerOrderIds: string[];
  disconnectedNodeIds: string[];
  unsupportedNodeIds: string[];
  renderable2d: boolean;
  connectedPorts: { sources: string[]; targets: string[] };
  layoutNodeIds: string[];
  layoutDepths?: Record<string, number>;
  layoutPositions: Record<string, { x: number; y: number }>;
}

export function graphPlan(session: WebSession, targetId = '__export__'): SharedGraphPlan {
  return JSON.parse(session.graph_plan_json(targetId));
}

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
  | { type: 'graph'; action: SharedGraphAction }
  | {
      type: 'edit_assets';
      collection: 'fontAssets' | 'modelAssets' | 'envAssets';
      upsert?: (Record<string, unknown> & { id: string })[];
      removeIds?: string[];
      replace?: (Record<string, unknown> & { id: string })[];
    }
  | {
      type: 'replace_document';
      document: {
        schemaVersion?: number;
        global: unknown;
        layers: unknown[];
        export: unknown;
        graph?: unknown;
        fontAssets?: unknown[];
        modelAssets?: unknown[];
        envAssets?: unknown[];
      };
    }
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
  assets: ('fontAssets' | 'modelAssets' | 'envAssets')[];
  document: boolean;
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
