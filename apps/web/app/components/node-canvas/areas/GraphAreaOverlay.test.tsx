import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GraphAreaEmptyStateOverlay } from './GraphAreaOverlay';

describe('GraphAreaEmptyStateOverlay', () => {
  it('renders non-spatial empty-area status and existing area actions', () => {
    const html = renderToStaticMarkup(
      <GraphAreaEmptyStateOverlay
        areas={[{ id: 'area-empty', name: 'Future branch', color: '#ff705f', nodeIds: [] }]}
        selectedAreaId={null}
        onSelectArea={() => {}}
        onRemoveArea={() => {}}
      />,
    );

    expect(html).toContain('data-canvas-chrome-state="empty"');
    expect(html).toContain('Future branch');
    expect(html).toContain('0 nodes');
    expect(html).toContain('aria-label="Select empty area Future branch"');
    expect(html).toContain('aria-label="Remove Future branch"');
  });

  it('renders nothing when every area has spatial bounds', () => {
    expect(
      renderToStaticMarkup(
        <GraphAreaEmptyStateOverlay areas={[]} selectedAreaId={null} onSelectArea={() => {}} onRemoveArea={() => {}} />,
      ),
    ).toBe('');
  });
});
