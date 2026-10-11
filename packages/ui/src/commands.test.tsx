import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Button, ButtonLink, COMMAND_FOUNDATION_SPECIMEN_IDS, FoundationCommandMatrix, IconButton } from './index';

describe('UI Foundation commands', () => {
  it('renders Button as a non-submitting command by default', () => {
    const markup = renderToStaticMarkup(<Button variant="primary">Create</Button>);

    expect(markup).toContain('type="button"');
    expect(markup).toContain('class="ui-command ui-command--primary"');
    expect(markup).toContain('>Create</button>');
  });

  it('swaps in a busy label without a spinner while keeping both labels in one cell', () => {
    const idle = renderToStaticMarkup(<Button busyLabel="Exporting…">Export</Button>);
    const busy = renderToStaticMarkup(
      <Button busyLabel="Exporting…" loading>
        Export
      </Button>,
    );

    expect(idle).toContain('<span class="ui-command__label" data-active="true">Export</span>');
    expect(idle).toContain('<span class="ui-command__label" data-active="false">Exporting…</span>');
    expect(busy).toContain('<span class="ui-command__label" data-active="false">Export</span>');
    expect(busy).toContain('<span class="ui-command__label" data-active="true">Exporting…</span>');
    expect(busy).toContain('aria-busy="true"');
    expect(busy).not.toContain('ui-command__progress');
  });

  it('removes a disabled ButtonLink from keyboard navigation', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ButtonLink to="/projects" disabled>
          Projects
        </ButtonLink>
      </MemoryRouter>,
    );

    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('href="/projects"');
  });

  it('accepts an anchor ref through the routing-aware ButtonLink contract', () => {
    const ref = createRef<HTMLAnchorElement>();
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ButtonLink ref={ref} to="/projects">
          Projects
        </ButtonLink>
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/projects"');
  });

  it('keeps the label available while a loading Button blocks repeat activation', () => {
    const markup = renderToStaticMarkup(<Button loading>Saving</Button>);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('class="ui-command__progress" aria-hidden="true"');
    expect(markup).toContain('Saving');
  });

  it('requires an accessible name for IconButton while hiding its glyph', () => {
    const markup = renderToStaticMarkup(<IconButton icon="+" label="Add layer" />);

    expect(markup).toContain('aria-label="Add layer"');
    expect(markup).toContain('class="ui-command__icon" aria-hidden="true"');
  });

  it('publishes one deterministic command specimen set for both Product Themes', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <FoundationCommandMatrix />
      </MemoryRouter>,
    );

    expect(COMMAND_FOUNDATION_SPECIMEN_IDS).toEqual([
      'button-primary',
      'button-secondary',
      'button-quiet',
      'button-danger',
      'button-danger-filled',
      'button-active',
      'button-disabled',
      'button-loading',
      'button-busy-label',
      'button-link-primary',
      'button-link-disabled',
      'icon-button-default',
      'icon-button-primary',
      'icon-button-danger',
      'icon-button-disabled',
    ]);
    for (const id of COMMAND_FOUNDATION_SPECIMEN_IDS) {
      expect(markup).toContain(`data-foundation-specimen="${id}"`);
    }
  });
});
