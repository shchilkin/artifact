import init, { new_project, WebSession } from '../generated/artifact_wasm';

export interface TextProperties {
  content: string;
  size: number;
  color: string;
  x: number;
  y: number;
}

export interface ImageProperties {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface LayerSummary {
  id: string;
  name: string;
  kind: string;
  scanlines: number | null;
  text: TextProperties | null;
  image: ImageProperties | null;
}

export interface EditorState {
  layers: Array<{ id: string; name: string; kind: string; visible?: boolean; locked?: boolean }>;
  order: string[];
  graph: { edges: Array<{ id: string; fromId: string; toId: string }> };
  canReorder: boolean;
  graphEditable: boolean;
}
export async function blankProject() {
  await init();
  return new_project();
}

export interface SessionSummary {
  editor: EditorState;
  layers: LayerSummary[];
  canUndo: boolean;
  canRedo: boolean;
}

/** Initialize once; each consumer owns and frees its independent WASM session. */
export async function openProject(source: string) {
  await init();
  return new WebSession(source);
}

export function readSummary(session: WebSession): SessionSummary {
  return { ...JSON.parse(session.summary_json()), editor: JSON.parse(session.editor_state_json()) };
}

export type { WebSession };
