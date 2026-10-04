/**
 * Per-layer host control (issue #429): which Artifact layers of a live artwork react to the visitor and which move on
 * their own. Bindings belong to the layers they drive; a host switches a layer's input-driven bindings
 * (`interactive`) and time-track bindings (`animated`) on or off without re-exporting the package.
 */

/** A document layer, as a live package names it: its Artifact id and its name in the layer panel. */
export interface LayerRef {
  readonly id: string;
  readonly name: string;
}

/** What a layer may do. Both default to `true`. */
export interface LayerSwitches {
  /** Bindings from visitor inputs (`pointer.*`, `hover`, `click`, `scroll`) drive the layer. */
  readonly interactive?: boolean;
  /** Bindings from time tracks (`wave`, `step`, `pulse`) drive the layer. */
  readonly animated?: boolean;
}

/** A host's layer configuration. Each call to `setLayerOptions` replaces the previous one as a whole. */
export interface LayerControl {
  /** Switches per layer, keyed by Artifact layer id or layer name. Unlisted layers take `layerDefaults`. */
  readonly layers?: Readonly<Record<string, LayerSwitches>>;
  /** Switches for every layer `layers` does not list. Default `{ interactive: true, animated: true }`. */
  readonly layerDefaults?: LayerSwitches;
}

export type LayerSwitch = keyof LayerSwitches;

export class LayerOptionsError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid layer options:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'LayerOptionsError';
    this.issues = issues;
  }
}

/** The layer a key names: an id first, then a name that exactly one layer has. Otherwise why not. */
export function findLayer(key: string, layers: readonly LayerRef[]): { layer: LayerRef } | { issue: string } {
  const unique = uniqueLayers(layers);
  const byId = unique.find((layer) => layer.id === key);
  if (byId) return { layer: byId };
  const named = unique.filter((layer) => layer.name === key);
  if (named.length === 1) return { layer: named[0] };
  if (named.length > 1) {
    return {
      issue: `${named.length} layers are named "${key}" (ids ${named.map((layer) => layer.id).join(', ')}); use an id`,
    };
  }
  const known = unique.map((layer) => `"${layer.name}" (${layer.id})`).join(', ');
  return { issue: `no layer has the id or name "${key}"; layers: ${known || 'none'}` };
}

/** Layers once each, by id, in the order given. */
export function uniqueLayers(layers: readonly LayerRef[]): LayerRef[] {
  const seen = new Set<string>();
  return layers.filter((layer) => {
    if (seen.has(layer.id)) return false;
    seen.add(layer.id);
    return true;
  });
}

/** Answers whether every layer in `ids` allows a switch; layers of a group with no layers take the defaults. */
export type LayerPolicy = (ids: readonly string[], kind: LayerSwitch) => boolean;

/** Every layer interactive and animated: the policy before a host says otherwise. */
export const ALL_LAYERS_ON: LayerPolicy = () => true;

/**
 * Resolves a host configuration against the layers a live artwork has. Throws `LayerOptionsError` listing every
 * key that names no layer or more than one, and every switch that is not a boolean, with its path.
 */
export function layerPolicy(control: LayerControl, layers: readonly LayerRef[]): LayerPolicy {
  const issues: string[] = [];
  const defaults = { interactive: true, animated: true, ...checkSwitches(control.layerDefaults, 'layerDefaults') };
  const byId = new Map<string, Required<LayerSwitches>>();
  for (const [key, switches] of Object.entries(control.layers ?? {})) {
    const path = `layers[${JSON.stringify(key)}]`;
    const found = findLayer(key, layers);
    const checked = checkSwitches(switches, path);
    if ('issue' in found) {
      issues.push(`${path}: ${found.issue}`);
      continue;
    }
    // An id and a name for the same layer merge, the later key winning per switch.
    byId.set(found.layer.id, { ...(byId.get(found.layer.id) ?? defaults), ...checked });
  }
  if (issues.length > 0) throw new LayerOptionsError(issues);
  return (ids, kind) => (ids.length === 0 ? defaults[kind] : ids.every((id) => (byId.get(id) ?? defaults)[kind]));

  function checkSwitches(value: unknown, path: string): LayerSwitches {
    if (value === undefined) return {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push(`${path}: must be { "interactive"?: boolean, "animated"?: boolean }`);
      return {};
    }
    const result: { interactive?: boolean; animated?: boolean } = {};
    for (const [key, switchValue] of Object.entries(value)) {
      if (key !== 'interactive' && key !== 'animated') {
        issues.push(`${path}.${key}: unknown key; expected interactive, animated`);
      } else if (typeof switchValue !== 'boolean') {
        issues.push(`${path}.${key}: must be true or false, got ${JSON.stringify(switchValue) ?? String(switchValue)}`);
      } else {
        result[key] = switchValue;
      }
    }
    return result;
  }
}
