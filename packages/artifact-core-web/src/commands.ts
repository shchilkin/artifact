/** Shared property commands used by the production editor and the native client.
 * The web document/history remains the owner; only the edited layer crosses WASM.
 */
type LayerRecord = { id: string; kind: string };
type Backend = { patch_layer: (layer: string, patch: string) => string };
let backend: Backend | undefined;
let loading: Promise<boolean> | undefined;

export function warmSharedCommands(): Promise<boolean> {
  loading ??= import('../generated/artifact_wasm')
    .then(async (module) => {
      await module.default();
      backend = module;
      return true;
    })
    .catch(() => false);
  return loading;
}

/** null means the existing Web implementation owns this operation.
 * Unsupported fields, ranges, asset references and unavailable WASM retain Web behavior.
 * No Rust session/history is retained alongside the canonical Web document.
 */
export function trySharedLayerPatch<T extends LayerRecord>(layer: T, patch: Partial<T>): T | null {
  if (!backend) return null;
  try {
    // Do not serialize unchanged image payloads or unrelated metadata on slider ticks.
    const context: Record<string, unknown> = { id: layer.id, kind: layer.kind };
    const record = layer as T & Record<string, unknown>;
    for (const key of new Set([...Object.keys(patch), 'minSz', 'maxSz'])) {
      if (key !== 'src' && key in layer) context[key] = record[key];
    }
    const edited = JSON.parse(backend.patch_layer(JSON.stringify(context), JSON.stringify(patch)));
    return { ...layer, ...edited } as T;
  } catch {
    return null;
  }
}
