import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeArtifactRuntimeProject, renderArtifactRuntimeProject } from './document.js';
import { parseArtifactRuntimeProject } from './project.js';

function project(layers: Array<Record<string, unknown>>, graph?: Record<string, unknown>) {
  return {
    artifactPackage: 'project',
    manifest: {
      kind: 'artifact-project-package',
      version: 1,
      documentSchemaVersion: 3,
    },
    document: {
      schemaVersion: 3,
      global: { seed: 42, aspect: '1:1', bg: 'transparent' },
      layers,
      graph,
    },
  };
}

function viberProject(fontRef: string) {
  return project(
    [
      { id: 'fill', kind: 'fill', color: '#5e30eb' },
      { id: 'warp', kind: 'effect', preset: 'noiseWarp', noiseWarp: 100 },
      { id: 'vortex', kind: 'effect', preset: 'vortex', vortex: 20 },
      { id: 'tear', kind: 'effect', preset: 'tear', tearAmt: 4, tearSize: 4 },
      { id: 'title', kind: 'text', font: fontRef, content: 'VIBER' },
    ],
    {
      edges: [
        { fromId: 'fill', toId: 'warp' },
        { fromId: 'warp', toId: 'vortex' },
        { fromId: 'vortex', toId: 'tear' },
        { fromId: 'tear', toId: 'title' },
        { fromId: 'title', toId: '__export__' },
      ],
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('full-document capability analysis', () => {
  it('accepts the strict Canvas2D layer stack', () => {
    const report = analyzeArtifactRuntimeProject(
      project([
        { id: 'fill', kind: 'fill', color: '#123456' },
        { id: 'image', kind: 'image', src: 'data:image/png;base64,AA==' },
        { id: 'title', kind: 'text', font: 'Inter', content: 'Artifact' },
        { id: 'grain', kind: 'effect', preset: 'grain', grain: 20 },
      ]),
    );

    expect(report).toMatchObject({
      supported: true,
      mode: 'stack',
      layerOrder: ['fill', 'image', 'title', 'grain'],
      requiredFonts: ['Inter'],
      issues: [],
    });
  });

  it('uses the saved linear graph order instead of array order', () => {
    const report = analyzeArtifactRuntimeProject(
      project(
        [
          { id: 'top', kind: 'image', src: 'data:image/png;base64,AA==' },
          { id: 'bottom', kind: 'fill', color: '#123456' },
        ],
        {
          edges: [
            { fromId: 'bottom', toId: 'top', toPort: 'bg' },
            { fromId: 'top', toId: '__export__', toPort: 'in' },
          ],
        },
      ),
    );

    expect(report.supported).toBe(true);
    expect(report.mode).toBe('linear-graph');
    expect(report.layerOrder).toEqual(['bottom', 'top']);
  });

  it('accepts the retained Viber effects and reports only the unresolved font', () => {
    const fontRef = 'artifact-font://viber';
    const report = analyzeArtifactRuntimeProject(viberProject(fontRef));

    expect(report.supported).toBe(false);
    expect(report.requiredFonts).toEqual([fontRef]);
    expect(report.issues.map((issue) => issue.code)).toEqual(['missing-font']);
  });

  it('accepts the retained Viber graph with an explicit host font mapping', () => {
    const fontRef = 'artifact-font://viber';
    const report = analyzeArtifactRuntimeProject(viberProject(fontRef), {
      fontFamilies: { [fontRef]: '"Portfolio Pixel", monospace' },
    });

    expect(report.supported).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('accepts an explicit host mapping for metadata-only fonts', () => {
    const fontRef = 'artifact-font://viber';
    const report = analyzeArtifactRuntimeProject(project([{ id: 'title', kind: 'text', font: fontRef }]), {
      fontFamilies: { [fontRef]: '"Viber Pixel", monospace' },
    });

    expect(report.supported).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('rejects package and payload schema versions outside the declared contract', () => {
    const valid = project([{ id: 'fill', kind: 'fill' }]);
    expect(() => parseArtifactRuntimeProject({ ...valid, manifest: { ...valid.manifest, version: 2 } })).toThrow(
      'package version 1',
    );
    expect(() => parseArtifactRuntimeProject({ ...valid, document: { ...valid.document, schemaVersion: 4 } })).toThrow(
      'received document schema 4',
    );
  });

  it('reports active unsupported effect behavior even when the preset label is supported', () => {
    const report = analyzeArtifactRuntimeProject(
      project([{ id: 'grain', kind: 'effect', preset: 'grain', barrel: 10, grain: 20 }]),
    );

    expect(report.supported).toBe(false);
    expect(report.issues).toEqual([expect.objectContaining({ code: 'unsupported-effect', layerId: 'grain' })]);
    expect(report.issues[0]?.message).toContain('barrel');
  });

  it('reports every unsupported graph node by id', () => {
    const report = analyzeArtifactRuntimeProject(
      project([{ id: 'fill', kind: 'fill' }], {
        edges: [{ fromId: 'fill', toId: '__export__' }],
        mergeNodes: [{ id: 'merge-a' }, { id: 'merge-b' }],
      }),
    );

    expect(report.issues.filter((issue) => issue.code === 'unsupported-graph-node')).toEqual([
      expect.objectContaining({ graphNodeId: 'merge-a' }),
      expect.objectContaining({ graphNodeId: 'merge-b' }),
    ]);
  });

  it('rejects unresolved local image references during capability analysis', () => {
    const report = analyzeArtifactRuntimeProject(
      project([{ id: 'image', kind: 'image', src: 'artifact-asset://local-image' }]),
    );

    expect(report.supported).toBe(false);
    expect(report.issues[0]).toMatchObject({ code: 'missing-image', layerId: 'image' });
  });

  it('rejects malformed layers before capability analysis', () => {
    expect(() => parseArtifactRuntimeProject(project([{ kind: 'fill' }]))).toThrow('invalid layer payload');
  });
});

describe('full-document static rendering', () => {
  it('renders a real fill layer into the caller-owned canvas', async () => {
    const calls: Array<{ color: string; height: number; width: number }> = [];
    const context = {
      clearRect() {},
      fillRect(_x: number, _y: number, width: number, height: number) {
        calls.push({ color: String(this.fillStyle), height, width });
      },
      fillStyle: '',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      restore() {},
      save() {},
    };
    const canvas = {
      getContext: () => context,
      height: 0,
      width: 0,
    } as unknown as HTMLCanvasElement;

    const report = await renderArtifactRuntimeProject({
      canvas,
      project: project([{ id: 'fill', kind: 'fill', color: '#5e30eb', opacity: 100 }]),
      width: 320,
      height: 180,
    });

    expect(report.supported).toBe(true);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
    expect(calls).toEqual([{ color: '#5e30eb', width: 320, height: 180 }]);
  });

  it('paints the canonical document background in stack mode', async () => {
    const fills: string[] = [];
    const gradient = { addColorStop() {} };
    const context = {
      clearRect() {},
      createRadialGradient: () => gradient,
      fillRect() {
        fills.push(String(this.fillStyle));
      },
      fillStyle: '',
      getImageData: () => ({ data: new Uint8ClampedArray() }),
      putImageData() {},
    };
    const canvas = {
      getContext: () => context,
      height: 0,
      width: 0,
    } as unknown as HTMLCanvasElement;
    const value = project([]);
    value.document.global.bg = '#123456';

    await renderArtifactRuntimeProject({ canvas, project: value, width: 64, height: 64 });

    expect(fills[0]).toBe('#123456');
    expect(fills).toHaveLength(2);
  });

  it('leaves the caller canvas untouched when an image cannot be decoded', async () => {
    class BrokenImage {
      crossOrigin = '';
      decoding = '';
      private onError?: () => void;

      addEventListener(type: string, listener: () => void) {
        if (type === 'error') this.onError = listener;
      }

      set src(_value: string) {
        queueMicrotask(() => this.onError?.());
      }
    }
    vi.stubGlobal('Image', BrokenImage);
    let clearCalls = 0;
    const canvas = {
      getContext: () => ({ clearRect: () => clearCalls++ }),
      height: 90,
      width: 120,
    } as unknown as HTMLCanvasElement;

    await expect(
      renderArtifactRuntimeProject({
        canvas,
        project: project([{ id: 'image', kind: 'image', src: 'https://example.test/missing.png' }]),
        width: 320,
        height: 180,
      }),
    ).rejects.toThrow('could not load image');

    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(90);
    expect(clearCalls).toBe(0);
  });
});
