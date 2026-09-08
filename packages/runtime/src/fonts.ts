import type { AnalyzeArtifactRuntimeProjectOptions, ArtifactRuntimeProject } from './types.js';

interface EmbeddedFont {
  id: string;
  dataUrl: string;
}

// Only embedded bytes are accepted here. External font URLs remain host-owned.
function embeddedFonts(project: ArtifactRuntimeProject): EmbeddedFont[] {
  const assets = project.document.fontAssets;
  if (!Array.isArray(assets)) return [];
  const ids = new Set<string>();
  const result: EmbeddedFont[] = [];
  for (const value of assets) {
    if (!value || typeof value !== 'object') continue;
    const asset = value as Record<string, unknown>;
    if (
      typeof asset.id !== 'string' ||
      ids.has(asset.id) ||
      typeof asset.dataUrl !== 'string' ||
      !/^data:(?:font\/(?:ttf|otf|woff2?)|application\/(?:font-woff|x-font-ttf|x-font-opentype|octet-stream));base64,[A-Za-z0-9+/]+={0,2}$/.test(
        asset.dataUrl,
      )
    )
      continue;
    ids.add(asset.id);
    result.push({ id: asset.id, dataUrl: asset.dataUrl });
  }
  return result;
}

export function embeddedFontMappings(project: ArtifactRuntimeProject): Record<string, string> {
  return Object.fromEntries(
    embeddedFonts(project).map((asset, index) => [`artifact-font://${asset.id}`, `"ArtifactEmbedded${index}"`]),
  );
}

let sessionNumber = 0;

export async function loadEmbeddedFonts(
  project: ArtifactRuntimeProject,
  options: AnalyzeArtifactRuntimeProjectOptions,
): Promise<{ fontFamilies: Record<string, string>; release: () => void }> {
  const fontFamilies = { ...options.fontFamilies };
  const faces: FontFace[] = [];
  const release = () => {
    for (const face of faces) document.fonts.delete(face);
    faces.length = 0;
  };
  const required = new Set(project.document.layers.filter((layer) => layer.kind === 'text').map((layer) => layer.font));
  const sessionId = ++sessionNumber;
  try {
    for (const [index, asset] of embeddedFonts(project).entries()) {
      const ref = `artifact-font://${asset.id}`;
      if (!required.has(ref) || fontFamilies[ref]) continue;
      if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
        throw new Error('Artifact Runtime requires the browser FontFace API for embedded fonts.');
      }
      // Session-local names prevent two artworks with the same asset ID and
      // different bytes from changing each other's typography.
      const family = `ArtifactEmbedded${sessionId}_${index}`;
      const face = new FontFace(family, `url("${asset.dataUrl}")`);
      await face.load();
      document.fonts.add(face);
      faces.push(face);
      fontFamilies[ref] = `"${family}"`;
    }
    return { fontFamilies, release };
  } catch (error) {
    release();
    throw error;
  }
}
