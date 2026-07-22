import type { ReactNode } from 'react';
import { Button, IconButton } from './commands';
import type { OverlayFoundationSpecimenId } from './foundation-overlay-specimens';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './overlays';

export function FoundationOverlayMatrix() {
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <div
        className="ui-foundation-matrix"
        data-foundation-section="overlays"
        aria-label="UI Foundation overlay matrix"
      >
        <OverlaySpecimen id="tooltip-closed" label="Tooltip / closed and pointer">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton icon="P" label="Preview document" variant="quiet" />
            </TooltipTrigger>
            <TooltipContent>Open a larger preview</TooltipContent>
          </Tooltip>
        </OverlaySpecimen>
        <OverlaySpecimen id="tooltip-open" label="Tooltip / open">
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button variant="secondary">Export help</Button>
            </TooltipTrigger>
            <TooltipContent>Exports use the current document size.</TooltipContent>
          </Tooltip>
        </OverlaySpecimen>
        <OverlaySpecimen id="tooltip-keyboard" label="Tooltip / keyboard">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button variant="quiet">Keyboard help</Button>
            </TooltipTrigger>
            <TooltipContent>Press Enter to run the focused command.</TooltipContent>
          </Tooltip>
        </OverlaySpecimen>
        <OverlaySpecimen id="tooltip-long-content" label="Tooltip / long content">
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button variant="quiet">Format details</Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              PNG preserves transparency. JPEG produces a smaller opaque file and is better suited to photographic
              artwork.
            </TooltipContent>
          </Tooltip>
        </OverlaySpecimen>
        <OverlaySpecimen id="popover-closed" label="Popover / closed and dismissal">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Project details</Button>
            </PopoverTrigger>
            <PopoverContent aria-label="Project details">
              <PopoverBody title="Night Transit" copy="Square artwork · saved locally" />
            </PopoverContent>
          </Popover>
        </OverlaySpecimen>
        <OverlaySpecimen id="popover-open" label="Popover / open">
          <Popover open>
            <PopoverTrigger asChild>
              <Button variant="secondary">Current export</Button>
            </PopoverTrigger>
            <PopoverContent aria-label="Current export" onOpenAutoFocus={(event) => event.preventDefault()}>
              <PopoverBody title="PNG export" copy="2400 × 2400 · transparent background" />
            </PopoverContent>
          </Popover>
        </OverlaySpecimen>
        <OverlaySpecimen id="popover-keyboard" label="Popover / keyboard and focus return">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Keyboard actions</Button>
            </PopoverTrigger>
            <PopoverContent aria-label="Keyboard actions">
              <PopoverBody title="Document actions" copy="Choose an action for the current document." />
              <div className="ui-foundation-popover-actions">
                <Button variant="primary">Apply selection</Button>
                <PopoverClose asChild>
                  <Button variant="quiet">Cancel</Button>
                </PopoverClose>
              </div>
            </PopoverContent>
          </Popover>
        </OverlaySpecimen>
        <OverlaySpecimen id="popover-long-content" label="Popover / long content">
          <Popover open>
            <PopoverTrigger asChild>
              <Button variant="secondary">Storage details</Button>
            </PopoverTrigger>
            <PopoverContent
              aria-label="Storage details"
              align="start"
              onOpenAutoFocus={(event) => event.preventDefault()}
              side="right"
            >
              <PopoverBody
                title="Local project storage"
                copy="Projects and imported assets stay in this browser until you export a portable document or clear local site data."
              />
            </PopoverContent>
          </Popover>
        </OverlaySpecimen>
      </div>
    </TooltipProvider>
  );
}

function PopoverBody({ copy, title }: { copy: string; title: string }) {
  return (
    <div className="ui-foundation-popover-stack">
      <strong className="ui-foundation-popover-title">{title}</strong>
      <p className="ui-foundation-popover-copy">{copy}</p>
    </div>
  );
}

function OverlaySpecimen({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: OverlayFoundationSpecimenId;
  label: string;
}) {
  return (
    <div className="ui-foundation-specimen ui-foundation-specimen--overlay" data-foundation-specimen={id}>
      <span className="ui-foundation-specimen__label">{label}</span>
      <div className="ui-foundation-specimen__control">{children}</div>
    </div>
  );
}
