import { isRecord, type StoredDocument } from './shared';

type StoredRecord = Record<string, unknown>;

/** Frozen: the 3D Scene node's settings and defaults when this step shipped. */
const SCENE_DEFAULTS: StoredRecord = {
  environmentSrc: '',
  environmentName: '',
  environmentMime: '',
  environmentBytes: 0,
  materialMode: 'original',
  transparent: true,
  exposure: 100,
  environmentStrength: 100,
  environmentRotation: 0,
  ambientIntensity: 115,
  keyAzimuth: 38,
  keyElevation: 42,
  keyIntensity: 145,
  fillIntensity: 65,
  rimIntensity: 55,
};
const ENVIRONMENT_FIELDS = ['environmentSrc', 'environmentName', 'environmentMime', 'environmentBytes'];
const OBJECT_KINDS = new Set(['primitive', 'model']);

interface Graph {
  edges: StoredRecord[];
  nodes: Record<string, StoredRecord>;
  positions: StoredRecord;
  areas: StoredRecord[];
  primitiveViewStates: StoredRecord;
  rest: StoredRecord;
}

function readGraph(raw: StoredRecord): Graph {
  const { edges, nodes, positions, areas, primitiveViewStates, ...rest } = raw;
  return {
    edges: Array.isArray(edges) ? edges.filter(isRecord) : [],
    nodes: isRecord(nodes) ? ({ ...nodes } as Record<string, StoredRecord>) : {},
    positions: isRecord(positions) ? { ...positions } : {},
    areas: Array.isArray(areas) ? areas.filter(isRecord) : [],
    primitiveViewStates: isRecord(primitiveViewStates) ? { ...primitiveViewStates } : {},
    rest,
  };
}

function incoming(graph: Graph, toId: string, port: string) {
  return graph.edges.find((edge) => edge.toId === toId && edge.toPort === port);
}

function pick(source: StoredRecord, keys: readonly string[]): StoredRecord {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

/** Removes a node id from the graph: its edges, position, area membership, and camera. */
function forget(graph: Graph, id: string) {
  graph.edges = graph.edges.filter((edge) => edge.fromId !== id && edge.toId !== id);
  delete graph.positions[id];
  delete graph.primitiveViewStates[id];
  graph.areas = graph.areas.map((area) =>
    Array.isArray(area.nodeIds) ? { ...area, nodeIds: area.nodeIds.filter((nodeId) => nodeId !== id) } : area,
  );
}

/** Points every connection leaving `fromId` at `toId` instead, or drops them when there is nothing to point at. */
function redirectOutputs(graph: Graph, fromId: string, toId: string | null) {
  graph.edges = graph.edges.flatMap((edge) => {
    if (edge.fromId !== fromId) return [edge];
    return toId ? [{ ...edge, fromId: toId }] : [];
  });
}

/**
 * The scene's environment, as the schema-18 renderer resolved it: a connected environment node's upload (even an
 * empty one) took precedence over the scene's legacy reference, and a branch on the environment node's input (or
 * any other node on the env port) was rendered as the environment.
 */
function migrateEnvironment(graph: Graph, scene: StoredRecord, sceneId: string): StoredRecord {
  const envEdge = incoming(graph, sceneId, 'env');
  const envNode = envEdge ? graph.nodes[String(envEdge.fromId)] : undefined;
  if (!envEdge || envNode?.kind !== 'environment') return pick(scene, ENVIRONMENT_FIELDS);
  const branch = incoming(graph, String(envEdge.fromId), 'in');
  graph.edges = graph.edges.flatMap((edge) => {
    if (edge !== envEdge) return [edge];
    return branch ? [{ ...edge, fromId: branch.fromId, fromPort: branch.fromPort }] : [];
  });
  return { environmentSrc: '', ...pick(envNode, ENVIRONMENT_FIELDS) };
}

function migrateScene(graph: Graph, layers: StoredRecord[], sceneId: string, scene: StoredRecord) {
  delete graph.nodes[sceneId];
  const modelEdge = incoming(graph, sceneId, 'model');
  const model = layers.find((layer) => layer.id === modelEdge?.fromId && OBJECT_KINDS.has(String(layer.kind)));
  if (!model || !modelEdge) {
    // A scene without a 3D source rendered only its backdrop.
    redirectOutputs(graph, sceneId, (incoming(graph, sceneId, 'bg')?.fromId as string | undefined) ?? null);
    forget(graph, sceneId);
    return;
  }
  const environment = migrateEnvironment(graph, scene, sceneId);
  graph.edges = graph.edges.filter((edge) => edge !== modelEdge);
  const settings = Object.keys(SCENE_DEFAULTS).filter((key) => !ENVIRONMENT_FIELDS.includes(key));
  const object: StoredRecord = {
    ...model,
    id: sceneId,
    name: typeof scene.name === 'string' ? scene.name : '3D Scene',
    visible: scene.hidden !== true,
    opacity: 100,
    blendMode: 'normal',
    scene: { ...SCENE_DEFAULTS, ...pick(scene, settings), ...environment },
  };
  delete object.clipToBelow;
  const modelIndex = layers.indexOf(model);
  const modelStillUsed = graph.edges.some((edge) => edge.fromId === model.id);
  if (modelStillUsed) {
    layers.splice(modelIndex + 1, 0, object);
  } else {
    layers.splice(modelIndex, 1, object);
    forget(graph, String(model.id));
  }
}

/**
 * Schema 18 -> 19: 3D Scene and Environment nodes fold into 3D Object layers. Each scene becomes a copy of the
 * primitive or model layer on its model port, under the scene's id and with the scene's settings, so its backdrop,
 * material, and output connections and its camera carry over. An environment node's upload moves into the settings;
 * the branch on its input connects straight to the layer's env port. The original source layer is removed when
 * nothing else used it. Leftover environment nodes pass their input branch through, as they rendered it.
 */
export function migrateV18ToV19(raw: StoredDocument): StoredDocument {
  if (!isRecord(raw.graph) || !isRecord(raw.graph.nodes)) return { ...raw, schemaVersion: 19 };
  const graph = readGraph(raw.graph);
  const layers: StoredRecord[] = Array.isArray(raw.layers)
    ? raw.layers.filter(isRecord).map((layer) => ({ ...layer }))
    : [];
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (isRecord(node) && node.kind === 'scene3d') migrateScene(graph, layers, id, node);
  }
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (!isRecord(node) || node.kind !== 'environment') continue;
    delete graph.nodes[id];
    redirectOutputs(graph, id, (incoming(graph, id, 'in')?.fromId as string | undefined) ?? null);
    forget(graph, id);
  }
  const hasViewStates = Object.keys(graph.primitiveViewStates).length > 0 || isRecord(raw.graph.primitiveViewStates);
  return {
    ...raw,
    schemaVersion: 19,
    layers,
    graph: {
      ...graph.rest,
      edges: graph.edges,
      positions: graph.positions,
      nodes: graph.nodes,
      ...(Array.isArray(raw.graph.areas) ? { areas: graph.areas } : {}),
      ...(hasViewStates ? { primitiveViewStates: graph.primitiveViewStates } : {}),
    },
  };
}
