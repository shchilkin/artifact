/**
 * Recipes: wired groups of nodes for common looks. Inserting one copies a starter document's layers, graph nodes,
 * connections, and layout into the current graph as a new area, with fresh ids.
 */
import { type CanvasDocument, type CanvasGraph, type GraphEdge, type Layer } from '../types/config';
import { EXPORT_NODE_ID, GRAPH_AREA_COLORS } from './nodeGraph';
import type { GraphNode } from './nodeKinds';
import {
  MASKED_TYPE_LINES_GRAPH_RECIPE,
  NOISE_MATTE_MERGE_GRAPH_RECIPE,
  PHOTO_TYPE_GRAPH_RECIPE,
  PRIMITIVE_IMAGE_GRAPH_RECIPE,
  PRINT_DAMAGE_GRAPH_RECIPE,
  ROTATED_CIRCLE_TOKENS_GRAPH_RECIPE,
  STICKER_GRID_GRAPH_RECIPE,
  TEXTURE_TYPE_STACK_STARTER,
  WARPED_LINE_POSTER_GRAPH_RECIPE,
} from './starterDocuments';
import type { StarterDocument } from './starterLayerDocuments';

export interface Recipe {
  id: string;
  label: string;
  /** What the recipe is made of, shown under its name. */
  hint: string;
  starter: StarterDocument;
}

export const RECIPES = [
  {
    id: 'photo-type',
    label: 'Photo + Type',
    hint: 'image / duotone / title / grain',
    starter: PHOTO_TYPE_GRAPH_RECIPE,
  },
  {
    id: 'texture-type',
    label: 'Texture Type',
    hint: 'noise / title / print finish',
    starter: TEXTURE_TYPE_STACK_STARTER,
  },
  {
    id: 'sticker-grid',
    label: 'Sticker Grid',
    hint: 'paper / array / registration',
    starter: STICKER_GRID_GRAPH_RECIPE,
  },
  {
    id: 'primitive-image',
    label: 'Primitive + Image',
    hint: 'object branch / image branch / merge',
    starter: PRIMITIVE_IMAGE_GRAPH_RECIPE,
  },
  {
    id: 'print-damage',
    label: 'Print Damage',
    hint: 'paper / halftone / tear / dust',
    starter: PRINT_DAMAGE_GRAPH_RECIPE,
  },
  {
    id: 'masked-lines',
    label: 'Masked Lines',
    hint: 'line field / type mask / print finish',
    starter: MASKED_TYPE_LINES_GRAPH_RECIPE,
  },
  {
    id: 'circle-tokens',
    label: 'Circle Tokens',
    hint: 'line pattern / repeat / rotation',
    starter: ROTATED_CIRCLE_TOKENS_GRAPH_RECIPE,
  },
  {
    id: 'warped-lines',
    label: 'Warped Lines',
    hint: 'line field / displace / type',
    starter: WARPED_LINE_POSTER_GRAPH_RECIPE,
  },
  {
    id: 'noise-matte',
    label: 'Noise Matte',
    hint: 'texture / noise mask / merge',
    starter: NOISE_MATTE_MERGE_GRAPH_RECIPE,
  },
] as const satisfies readonly Recipe[];

export type RecipeId = (typeof RECIPES)[number]['id'];

export function isRecipeId(value: unknown): value is RecipeId {
  return RECIPES.some((recipe) => recipe.id === value);
}

export function findRecipe(id: RecipeId): Recipe {
  const recipe = RECIPES.find((item) => item.id === id);
  if (!recipe) throw new Error(`Unknown recipe ${id}`);
  return recipe;
}

let idCounter = 0;

function defaultCreateId(base: string): string {
  idCounter += 1;
  return `${base}-${Date.now().toString(36)}-${idCounter}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface RecipeInsertResult {
  doc: CanvasDocument;
  /** The id that fed the recipe's Output: the node to select. */
  outputId: string | null;
}

/**
 * Copies a recipe into `doc` with its top-left node at `position`. The recipe's own layers, graph nodes, and
 * connections keep their wiring under new ids and are grouped in a new area. The node that fed the recipe's Output
 * feeds the document's Output too when nothing does yet; otherwise it is left for the user to connect.
 */
export function insertRecipeInDocument(
  doc: CanvasDocument,
  recipeId: RecipeId,
  position: { x: number; y: number },
  createId: (base: string) => string = defaultCreateId,
): RecipeInsertResult {
  const recipe = findRecipe(recipeId);
  const source = recipe.starter.doc;
  const ids = new Map<string, string>();
  for (const layer of source.layers) ids.set(layer.id, createId(layer.id));
  for (const id of Object.keys(source.graph.nodes)) ids.set(id, createId(id));

  const layers: Layer[] = source.layers.map((layer) => ({ ...cloneJson(layer), id: ids.get(layer.id)! }));
  const nodes: Record<string, GraphNode> = Object.fromEntries(
    Object.values(source.graph.nodes).map((node) => [ids.get(node.id)!, { ...cloneJson(node), id: ids.get(node.id)! }]),
  );

  let outputId: string | null = null;
  const edges: GraphEdge[] = [];
  source.graph.edges.forEach((edge, index) => {
    const fromId = ids.get(edge.fromId);
    if (!fromId) return;
    if (edge.toId === EXPORT_NODE_ID) {
      outputId = fromId;
      return;
    }
    const toId = ids.get(edge.toId);
    if (toId) edges.push({ ...edge, id: createId(`edge-${index}`), fromId, toId });
  });

  const sourcePositions = [...ids.keys()].flatMap((id) => {
    const point = source.graph.positions[id];
    return point ? [[id, point] as const] : [];
  });
  const minX = Math.min(...sourcePositions.map(([, point]) => point.x));
  const minY = Math.min(...sourcePositions.map(([, point]) => point.y));
  const positions = Object.fromEntries(
    sourcePositions.map(([id, point]) => [
      ids.get(id)!,
      { x: position.x + point.x - minX, y: position.y + point.y - minY },
    ]),
  );
  const viewStates = Object.fromEntries(
    Object.entries(source.graph.primitiveViewStates ?? {}).flatMap(([id, view]) =>
      ids.has(id) ? [[ids.get(id)!, view]] : [],
    ),
  );

  const outputFree = !doc.graph.edges.some((edge) => edge.toId === EXPORT_NODE_ID);
  const outputEdges: GraphEdge[] =
    outputFree && outputId
      ? [{ id: createId('edge-output'), fromId: outputId, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }]
      : [];
  const areas = doc.graph.areas ?? [];
  const graph: CanvasGraph = {
    ...doc.graph,
    edges: [...doc.graph.edges, ...edges, ...outputEdges],
    positions: { ...doc.graph.positions, ...positions },
    nodes: { ...doc.graph.nodes, ...nodes },
    areas: [
      ...areas,
      {
        id: createId('area'),
        name: recipe.label,
        nodeIds: [...ids.values()],
        color: GRAPH_AREA_COLORS[areas.length % GRAPH_AREA_COLORS.length],
      },
    ],
    ...(Object.keys(viewStates).length > 0
      ? { primitiveViewStates: { ...doc.graph.primitiveViewStates, ...viewStates } }
      : {}),
  };
  return { doc: { ...doc, layers: [...doc.layers, ...layers], graph }, outputId };
}
