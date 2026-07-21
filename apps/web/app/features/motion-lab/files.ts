import { type MixedMediaMotionRecipe, parseMixedMediaMotionRecipe } from '@shchilkin/artifact-runtime';
import viberMotionRecipeText from '../../../../../docs/experiments/fixtures/viber.motion.json?raw';
import { MOTION_LAB_VIBER_PROJECT_URL } from '../../motionLabFixture';

export type MotionLabRuntimeProject = {
  document: {
    layers: Array<Record<string, unknown> & { id: string; kind: string; name?: string; font?: string }>;
  };
};

export interface LoadedComposition {
  fileName: string;
  sha256: string;
  value: MotionLabRuntimeProject;
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function parseComposition(text: string, fileName: string): Promise<LoadedComposition> {
  const value = JSON.parse(text) as MotionLabRuntimeProject;
  if (!value.document || !Array.isArray(value.document.layers))
    throw new Error('The selected file is not a portable Artifact project.');
  return { fileName, sha256: await sha256(text), value };
}

export function parseRecipe(text: string) {
  return parseMixedMediaMotionRecipe(JSON.parse(text));
}

export async function readDefaultFixture() {
  const compositionResponse = await fetch(MOTION_LAB_VIBER_PROJECT_URL);
  if (!compositionResponse.ok) throw new Error('The retained local fixture is unavailable. Load both files manually.');
  const compositionText = await compositionResponse.text();
  return {
    composition: await parseComposition(compositionText, 'viber.artifact'),
    recipe: parseRecipe(viberMotionRecipeText),
  };
}

export function downloadRecipe(recipe: MixedMediaMotionRecipe) {
  const blob = new Blob([`${JSON.stringify(recipe, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'viber.motion.json';
  anchor.click();
  URL.revokeObjectURL(url);
}
