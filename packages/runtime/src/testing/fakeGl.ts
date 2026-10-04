/**
 * A recording stand-in for `WebGL2RenderingContext`, enough for the runtime's chain and lifecycle in Node.
 * It counts created and deleted GL objects, draws, and pixel readbacks.
 */
export interface FakeGl {
  readonly gl: WebGL2RenderingContext;
  /** GL objects created and not yet deleted, by kind. */
  live(): Record<string, number>;
  readonly counts: { created: number; deleted: number; draws: number; readPixels: number };
  /** Draw calls per framebuffer binding: `null` is the canvas. */
  readonly drawTargets: (object | null)[];
}

const CREATE_KINDS = ['Texture', 'Framebuffer', 'Buffer', 'Program', 'Shader', 'VertexArray'] as const;

export function createFakeGl(): FakeGl {
  const liveObjects = new Map<object, string>();
  const counts = { created: 0, deleted: 0, draws: 0, readPixels: 0 };
  const drawTargets: (object | null)[] = [];
  let framebuffer: object | null = null;
  const constants = new Map<string, number>();

  const impl: Record<string, unknown> = {
    getShaderParameter: () => true,
    getProgramParameter: (_program: object, pname: number) => (pname === constant('ACTIVE_UNIFORMS') ? 0 : true),
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getActiveUniform: () => null,
    getUniformLocation: () => ({}),
    getError: () => 0,
    bindFramebuffer: (_target: number, next: object | null) => {
      framebuffer = next;
    },
    drawArrays: () => {
      counts.draws += 1;
      drawTargets.push(framebuffer);
    },
    readPixels: () => {
      counts.readPixels += 1;
    },
  };
  for (const kind of CREATE_KINDS) {
    impl[`create${kind}`] = () => {
      const object = { kind };
      liveObjects.set(object, kind);
      counts.created += 1;
      return object;
    };
    impl[`delete${kind}`] = (object: object | null) => {
      if (object && liveObjects.delete(object)) counts.deleted += 1;
    };
  }

  function constant(name: string): number {
    let value = constants.get(name);
    if (value === undefined) {
      value = 0x1000 + constants.size;
      constants.set(name, value);
    }
    return value;
  }

  const gl = new Proxy(impl, {
    get(target, property) {
      if (typeof property !== 'string') return undefined;
      if (property in target) return target[property];
      if (/^[A-Z0-9_]+$/.test(property)) return constant(property);
      return () => undefined;
    },
  }) as unknown as WebGL2RenderingContext;

  return {
    gl,
    counts,
    drawTargets,
    live() {
      const byKind: Record<string, number> = {};
      for (const kind of liveObjects.values()) byKind[kind] = (byKind[kind] ?? 0) + 1;
      return byKind;
    },
  };
}

/** A canvas whose `getContext('webgl2')` returns the fake context. */
export function createFakeCanvas(fake: FakeGl, width = 540, height = 540): HTMLCanvasElement {
  return {
    width,
    height,
    getContext: (kind: string) => (kind === 'webgl2' ? fake.gl : null),
  } as unknown as HTMLCanvasElement;
}

/** A frame scheduler stepped by hand. */
export function createManualScheduler() {
  let nextHandle = 1;
  let clock = 0;
  const pending = new Map<number, () => void>();
  let requested = 0;
  return {
    get requested() {
      return requested;
    },
    get pending() {
      return pending.size;
    },
    requestFrame(callback: () => void) {
      requested += 1;
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancelFrame(handle: number) {
      pending.delete(handle);
    },
    now: () => clock,
    /** Advances the clock by `ms` and runs the frames that were pending, `count` times. */
    step(count = 1, ms = 1000 / 60) {
      for (let index = 0; index < count; index += 1) {
        clock += ms;
        const callbacks = [...pending.values()];
        pending.clear();
        for (const callback of callbacks) callback();
      }
    },
  };
}
