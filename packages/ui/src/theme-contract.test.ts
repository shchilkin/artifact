import { describe, expect, it } from 'vitest';
import { UI_FOUNDATION_THEME_TOKENS } from './index';

describe('UI Foundation Theme Contract', () => {
  it('publishes the command and Brand Signature roles required by both Product Themes', () => {
    expect(UI_FOUNDATION_THEME_TOKENS).toEqual([
      '--ui-command-font-family',
      '--ui-command-font-size',
      '--ui-command-font-weight',
      '--ui-command-letter-spacing',
      '--ui-command-text-transform',
      '--ui-command-height',
      '--ui-command-height-compact',
      '--ui-command-padding-inline',
      '--ui-command-gap',
      '--ui-command-radius',
      '--ui-command-surface',
      '--ui-command-surface-hover',
      '--ui-command-surface-active',
      '--ui-command-text',
      '--ui-command-text-hover',
      '--ui-command-border',
      '--ui-command-border-hover',
      '--ui-command-accent',
      '--ui-command-accent-hover',
      '--ui-command-accent-contrast',
      '--ui-command-danger',
      '--ui-command-danger-surface',
      '--ui-focus-ring',
      '--ui-focus-offset',
      '--ui-disabled-opacity',
      '--ui-motion-fast',
      '--ui-ease-out',
      '--ui-brand-field',
      '--ui-brand-frame',
      '--ui-brand-signal',
      '--ui-brand-shadow',
    ]);
  });
});
