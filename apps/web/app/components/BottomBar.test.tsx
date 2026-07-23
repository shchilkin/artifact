import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { BottomBar } from './BottomBar';

describe('BottomBar command semantics', () => {
  it('names command groups, export progress, and project workspace status', () => {
    const html = renderToStaticMarkup(
      <BottomBar
        onNewBlank={vi.fn()}
        onRandomize={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        canUndo
        canRedo={false}
        undoCount={2}
        onProjectsToggle={vi.fn()}
        onCopyLink={vi.fn()}
        onOpenDocument={vi.fn()}
        onSaveDocument={vi.fn()}
        onSaveProjectPackage={vi.fn()}
        onExport={vi.fn()}
        exportBusy
        projectWorkspaceStatus={{
          tone: 'warning',
          badge: 'WARN',
          title: 'Local workspace has warnings',
        }}
      />,
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Document history"');
    expect(html).toContain('aria-label="File actions"');
    expect(html).toContain('aria-label="Project and export actions"');
    expect(html).toContain('aria-label="Exporting artwork"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Projects. Local workspace has warnings. WARN"');
  });
});
