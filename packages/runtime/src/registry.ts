import type { ChainPass, UniformValues } from './types.js';

/**
 * The authored fields of an editor `EffectLayer` (`apps/web/app/types/config.ts`) that an effect reads. The runtime
 * does not import the editor's types; each effect names the fields it needs.
 */
export interface AuthoredEffectLayer {
  readonly seedOffset?: number;
}

/** Document-level values an effect's uniforms may depend on. */
export interface EffectContext {
  /** `doc.global.seed`. */
  readonly seed: number;
  /** Render size in pixels, for effects whose editor uniforms depend on it. */
  readonly width: number;
  readonly height: number;
}

/** Default `uCenter` for centred effects: the middle of the frame, so static output matches the editor. */
export const DEFAULT_CENTER: readonly [number, number] = [0.5, 0.5];

export interface EffectDefinition<Layer extends AuthoredEffectLayer = AuthoredEffectLayer> {
  /** Stable id, matching the editor's effect control name (for example `noiseWarp`). */
  readonly id: string;
  /** A Pixi-compatible GLSL ES 1.00 fragment, imported from the editor's shader source. */
  readonly fragment: string;
  /**
   * Further fragments drawn after `fragment` with the same uniforms (see `ChainPass.stages`), for an editor effect
   * that runs in more than one place. Uniform names must not clash between stages.
   */
  readonly stages?: readonly string[];
  // Method syntax keeps definitions for narrower layer types assignable to the registry's list.
  /**
   * Authored layer fields the effect reads. Bindings may drive these; the per-frame values go through `uniforms`, so
   * a field binding produces the same uniforms the editor would for that field value.
   */
  readonly fields: readonly string[];
  /** The effect runs when this authored field is above zero, as in the editor's filter builder. */
  amount(layer: Layer): number;
  /** Maps authored values to the uniforms the editor passes for the same layer. */
  uniforms(layer: Layer, context: EffectContext): UniformValues;
  /** The fragment reads `uniform vec2 uCenter`, defaulting to `DEFAULT_CENTER`, so the centre can be bound. */
  readonly centered: boolean;
  /**
   * The output depends on noise that differs from the editor's CPU path by design, so parity is judged by
   * statistics rather than pixels.
   */
  readonly stochastic: boolean;
}

export interface EffectRegistry {
  has(id: string): boolean;
  get(id: string): EffectDefinition | undefined;
  ids(): readonly string[];
  /**
   * The uniforms one effect reads for an authored layer, including the default `uCenter` of centred effects.
   * Throws for an unknown id.
   */
  uniforms(
    id: string,
    layer: AuthoredEffectLayer & Readonly<Record<string, unknown>>,
    context: EffectContext,
  ): UniformValues;
  /**
   * The pass for one effect of an authored layer (for example an editor `EffectLayer`), or `null` when the effect
   * is off for that layer.
   */
  pass(
    id: string,
    layer: AuthoredEffectLayer & Readonly<Record<string, unknown>>,
    context: EffectContext,
  ): ChainPass | null;
}

const CENTER_DECLARATION = /uniform\s+vec2\s+uCenter\s*;/;

export function defineEffect<Layer extends AuthoredEffectLayer>(
  definition: EffectDefinition<Layer>,
): EffectDefinition<Layer> {
  return definition;
}

export function createEffectRegistry(definitions: readonly EffectDefinition[]): EffectRegistry {
  const byId = new Map<string, EffectDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) throw new Error(`Effect "${definition.id}" is registered twice.`);
    if (definition.centered && !CENTER_DECLARATION.test(definition.fragment)) {
      throw new Error(`Effect "${definition.id}" is centred but its fragment does not declare uniform vec2 uCenter.`);
    }
    byId.set(definition.id, definition);
  }

  const definitionFor = (id: string) => {
    const definition = byId.get(id);
    if (!definition) throw new Error(`Unknown effect "${id}".`);
    return definition;
  };
  const uniformsFor = (
    definition: EffectDefinition,
    layer: AuthoredEffectLayer & Readonly<Record<string, unknown>>,
    context: EffectContext,
  ): UniformValues => {
    const uniforms = definition.uniforms(layer, context);
    return definition.centered ? { uCenter: DEFAULT_CENTER, ...uniforms } : uniforms;
  };

  return {
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    ids: () => [...byId.keys()],
    uniforms: (id, layer, context) => uniformsFor(definitionFor(id), layer, context),
    pass(id, layer, context) {
      const definition = definitionFor(id);
      if (!(definition.amount(layer) > 0)) return null;
      return chainPass(definition, uniformsFor(definition, layer, context));
    },
  };
}

/** The chain pass that draws an effect with these uniforms: its fragment, then its stages, if any. */
export function chainPass(definition: EffectDefinition, uniforms: UniformValues): ChainPass {
  const pass = { id: definition.id, fragment: definition.fragment, uniforms };
  return definition.stages ? { ...pass, stages: definition.stages } : pass;
}

/** The seed the editor gives an effect layer's GPU filters: `doc.global.seed + layer.seedOffset`. */
export function effectLayerSeed(context: EffectContext, layer: AuthoredEffectLayer): number {
  return context.seed + (layer.seedOffset ?? 0);
}
