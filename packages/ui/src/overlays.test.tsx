import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FoundationOverlayMatrix,
  OVERLAY_FOUNDATION_SPECIMEN_IDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './index';

describe('UI Foundation overlays', () => {
  it('keeps a Tooltip trigger independently named when composed as a child', () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Preview document">
              P
            </button>
          </TooltipTrigger>
          <TooltipContent>Open a larger preview</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(markup).toContain('aria-label="Preview document"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('data-state="closed"');
  });

  it('preserves native Popover trigger props through child composition', () => {
    const markup = renderToStaticMarkup(
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" data-command="inspect">
            Inspect
          </button>
        </PopoverTrigger>
        <PopoverContent aria-label="Inspector actions">Actions</PopoverContent>
      </Popover>,
    );

    expect(markup).toContain('data-command="inspect"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('data-state="closed"');
  });

  it('publishes one deterministic overlay specimen set for both Product Themes', () => {
    const markup = renderToStaticMarkup(<FoundationOverlayMatrix />);

    expect(OVERLAY_FOUNDATION_SPECIMEN_IDS).toEqual([
      'tooltip-closed',
      'tooltip-open',
      'tooltip-keyboard',
      'tooltip-long-content',
      'popover-closed',
      'popover-open',
      'popover-keyboard',
      'popover-long-content',
    ]);
    for (const id of OVERLAY_FOUNDATION_SPECIMEN_IDS) {
      expect(markup).toContain(`data-foundation-specimen="${id}"`);
    }
  });
});
