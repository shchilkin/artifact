import {
  LIVE_PACKAGE_MANIFEST,
  type LivePackage,
  livePackageFiles,
  parseLivePackage,
} from '../../../../../../packages/runtime/src/livePackage';
import { readZip } from './zip';

/** Decodes an exported package's files (by path) into the parsed package the runtime plays. */
export async function livePackageFromFiles(files: ReadonlyMap<string, Blob>): Promise<LivePackage> {
  const manifestFile = files.get(LIVE_PACKAGE_MANIFEST);
  if (!manifestFile) throw new Error(`The package has no ${LIVE_PACKAGE_MANIFEST}.`);
  const manifest = parseLivePackage(JSON.parse(await manifestFile.text()));
  const paths = livePackageFiles(manifest);
  const images = await Promise.all(
    paths.map(async (path) => {
      const blob = files.get(path);
      if (!blob) throw new Error(`The package has no "${path}".`);
      return [path, await decodeImage(blob)] as const;
    }),
  );
  return { manifest, images: Object.fromEntries(images) };
}

/** Reads a zipped package back into its files. */
export async function filesFromZip(zip: Blob): Promise<Map<string, Blob>> {
  const entries = readZip(new Uint8Array(await zip.arrayBuffer()));
  return new Map(entries.map((entry) => [entry.path, new Blob([entry.data as BlobPart])]));
}

async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
