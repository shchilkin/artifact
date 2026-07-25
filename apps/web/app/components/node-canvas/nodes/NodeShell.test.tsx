import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { NodeShell } from './NodeShell';

describe('NodeShell', () => {
  it('exposes category, selection, output, muted, and locked housing states', () => {
    const html = renderToStaticMarkup(
      <NodeShell
        kind="effect"
        label="effect"
        name="Paper grain"
        selected
        outputPath
        muted
        onToggleMuted={vi.fn()}
        onDelete={vi.fn()}
        deleteDisabled
      >
        <div>Preview</div>
      </NodeShell>,
    );

    expect(html).toContain('data-node-kind="effect"');
    expect(html).toContain('data-node-housing-state="selected output-path muted locked"');
    expect(html).toContain(
      'class="node-shell node-shell-kind-effect node-shell-output-path node-shell-selected node-shell-muted"',
    );
    expect(html).toContain('aria-label="Node commands"');
    expect(html).toContain('aria-label="Unmute node"');
    expect(html).toContain('Locked — deletion unavailable');
    expect(html).not.toContain('aria-label="Delete node"');
  });

  it('omits node-local commands when no actions are available', () => {
    const html = renderToStaticMarkup(
      <NodeShell kind="export" label="export" name="Output">
        <div>Preview</div>
      </NodeShell>,
    );

    expect(html).toContain('data-node-housing-state="default"');
    expect(html).not.toContain('aria-label="Node commands"');
    expect(html).not.toContain('aria-label="Mute node"');
    expect(html).not.toContain('aria-label="Delete node"');
  });
});
