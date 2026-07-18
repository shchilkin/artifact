import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, ButtonLink, COMMAND_FOUNDATION_SPECIMEN_IDS, FoundationCommandMatrix, IconButton } from './index';

describe('UI Foundation commands', () => {
  it('renders Button as a non-submitting command by default', () => {
    const markup = renderToStaticMarkup(<Button variant="primary">Create</Button>);

    expect(markup).toContain('type="button"');
    expect(markup).toContain('class="ui-command ui-command--primary"');
    expect(markup).toContain('>Create</button>');
  });

  it('removes a disabled ButtonLink from keyboard navigation', () => {
    const markup = renderToStaticMarkup(
      <ButtonLink href="/projects" disabled>
        Projects
      </ButtonLink>,
    );

    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('href="/projects"');
  });

  it('requires an accessible name for IconButton while hiding its glyph', () => {
    const markup = renderToStaticMarkup(<IconButton icon="+" label="Add layer" />);

    expect(markup).toContain('aria-label="Add layer"');
    expect(markup).toContain('class="ui-command__icon" aria-hidden="true"');
  });

  it('publishes one deterministic command specimen set for both Product Themes', () => {
    const markup = renderToStaticMarkup(<FoundationCommandMatrix />);

    expect(COMMAND_FOUNDATION_SPECIMEN_IDS).toEqual([
      'button-primary',
      'button-secondary',
      'button-quiet',
      'button-danger',
      'button-disabled',
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
