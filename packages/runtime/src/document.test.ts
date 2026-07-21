import { describe, expect, it } from 'vitest';
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
      global: { seed: 42, aspect: '1:1' },
      layers,
      graph,
    },
  };
}

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

  it('reports the exact blockers in the retained Viber graph', () => {
    const fontRef = 'artifact-font://viber';
    const report = analyzeArtifactRuntimeProject(
      project(
        [
          { id: 'fill', kind: 'fill', color: '#5e30eb' },
          { id: 'warp', kind: 'effect', preset: 'noiseWarp', noiseWarp: 100 },
          { id: 'vortex', kind: 'effect', preset: 'vortex', vortex: 20 },
          { id: 'tear', kind: 'effect', preset: 'tear', tearAmt: 4 },
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
      ),
    );

    expect(report.supported).toBe(false);
    expect(report.requiredFonts).toEqual([fontRef]);
    expect(report.issues.map((issue) => issue.code)).toEqual([
      'unsupported-effect',
      'unsupported-effect',
      'unsupported-effect',
      'missing-font',
    ]);
  });

  it('accepts an explicit host mapping for metadata-only fonts', () => {
    const fontRef = 'artifact-font://viber';
    const report = analyzeArtifactRuntimeProject(project([{ id: 'title', kind: 'text', font: fontRef }]), {
      fontFamilies: { [fontRef]: '"Viber Pixel", monospace' },
    });

    expect(report.supported).toBe(true);
    expect(report.issues).toEqual([]);
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
});
