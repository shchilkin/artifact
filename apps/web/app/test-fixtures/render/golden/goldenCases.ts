import { ASPECT_SIZES, type CanvasDocument } from '../../../types/config';
import { CURATED_EXAMPLES } from '../../../utils/curatedExamples';
import { bootstrapDocumentGraph } from '../../../utils/documentCommands';
import { HERO_FRAMES } from '../../../utils/heroConfigs';
import { GRAPH_RECIPE_STARTER_DOCUMENTS, LAYER_STARTER_DOCUMENTS } from '../../../utils/starterDocuments';

/** Long side of the preview-sized render, matching the 540px authoring baseline. */
export const GOLDEN_PREVIEW_LONG_SIDE = 540;

/**
 * How a golden case is rendered:
 * - `stack`: a document without a graph, rendered as a layer stack.
 * - `graph`: the document's own graph, or for a stack document the graph the editor creates when the user
 *   opens Nodes (`bootstrapDocumentGraph`).
 */
export type GoldenMode = 'stack' | 'graph';

export interface GoldenCase {
  /** Stable key used for baseline file names. */
  id: string;
  doc: CanvasDocument;
  modes: GoldenMode[];
}

function caseFor(id: string, doc: CanvasDocument): GoldenCase {
  return { id, doc, modes: doc.graph ? ['graph'] : ['stack', 'graph'] };
}

/** Every shipped starter, curated example, and landing hero frame, each listed once. */
export function collectGoldenCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  const seen = new Set<CanvasDocument>();
  const add = (id: string, doc: CanvasDocument) => {
    if (seen.has(doc)) return;
    seen.add(doc);
    cases.push(caseFor(id, doc));
  };

  for (const starter of [...LAYER_STARTER_DOCUMENTS, ...GRAPH_RECIPE_STARTER_DOCUMENTS]) {
    add(`starter-${starter.id}`, starter.doc);
  }
  for (const example of CURATED_EXAMPLES) add(`example-${example.id}`, example.doc);
  HERO_FRAMES.forEach((frame, index) => add(`hero-${index}`, frame.doc));
  return cases;
}

export function documentForMode(doc: CanvasDocument, mode: GoldenMode): CanvasDocument {
  return mode === 'graph' ? bootstrapDocumentGraph(doc) : doc;
}

export function previewSize(doc: CanvasDocument): [number, number] {
  const [width, height] = ASPECT_SIZES[doc.global.aspect];
  const scale = GOLDEN_PREVIEW_LONG_SIDE / Math.max(width, height);
  return [Math.round(width * scale), Math.round(height * scale)];
}
