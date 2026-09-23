import init, { WebSession } from '../generated/artifact_wasm';

export interface TextProperties {
  content: string;
  size: number;
  color: string;
  x: number;
  y: number;
}

export interface LayerSummary {
  id: string;
  name: string;
  kind: string;
  scanlines: number | null;
  text: TextProperties | null;
}

export interface SessionSummary {
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
  return JSON.parse(session.summary_json());
}

export type { WebSession };
