import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@artifact/ui';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';

import { useMediaQuery } from '../../../../hooks/useMediaQuery';
import { NoPan } from '../../nodes/NoPan';

type HelpOpen = 'hover' | 'pinned' | null;

interface SliderHelpState {
  open: HelpOpen;
  setOpen: (open: HelpOpen) => void;
  hover: { enter: () => void; leave: () => void };
}

const HELP_HOVER_CLOSE_MS = 150;
/** Clears the inspector's padding beside the row, so the help starts outside the panel rather than over its edge. */
const HELP_SIDE_OFFSET = 16;
/** Below this width the side of the row has no room, so help opens below the row instead. */
const NARROW_QUERY = '(max-width: 767px)';

const SliderHelpContext = createContext<SliderHelpState | null>(null);

/**
 * Help beside a slider row. Hovering the "About …" button previews it; a click, Enter, or Space keeps it open until
 * the button is pressed again, Escape, or a press outside. It is anchored to the whole row, so it sits beside the
 * control it explains instead of over it: to its left, where the canvas is, or below it on narrow screens. Radix only
 * flips to the opposite side when that side has more room, and the inspector's own edge leaves none to its right, so
 * the help never opens over the inspector.
 */
export function SliderHelp({ label, content, children }: { label: string; content: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState<HelpOpen>(null);
  const narrow = useMediaQuery(NARROW_QUERY);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const hover = {
    enter: () => {
      clearTimeout(closeTimer.current);
      setOpen((current) => current ?? 'hover');
    },
    leave: () => {
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(
        () => setOpen((current) => (current === 'hover' ? null : current)),
        HELP_HOVER_CLOSE_MS,
      );
    },
  };
  return (
    <SliderHelpContext.Provider value={{ open, setOpen, hover }}>
      <Popover open={open !== null} onOpenChange={(next) => setOpen(next ? 'pinned' : null)}>
        <PopoverAnchor asChild>{children}</PopoverAnchor>
        <PopoverContent
          className="artifact-inspector-help"
          side={narrow ? 'bottom' : 'left'}
          sideOffset={HELP_SIDE_OFFSET}
          align="start"
          aria-label={`About ${label}`}
          onOpenAutoFocus={(event) => {
            // A hover preview must not take focus from where the person is working.
            if (open === 'hover') event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            // Escape closes the help only, not the selection or panel around it.
            event.stopPropagation();
          }}
          onMouseEnter={hover.enter}
          onMouseLeave={hover.leave}
        >
          {content}
        </PopoverContent>
      </Popover>
    </SliderHelpContext.Provider>
  );
}

/** The "About …" button that opens the help of the `SliderHelp` around it. */
export function SliderHelpTrigger({ label }: { label: string }) {
  const help = useContext(SliderHelpContext);
  if (!help) return null;
  return (
    <PopoverTrigger
      asChild
      onClick={(event) => {
        // A press pins the help, or closes it when it is already pinned; it never closes a hover preview.
        event.preventDefault();
        help.setOpen(help.open === 'pinned' ? null : 'pinned');
      }}
      onMouseEnter={help.hover.enter}
      onMouseLeave={help.hover.leave}
    >
      <NoPan as="button" type="button" className="artifact-inspector-info" aria-label={`About ${label}`}>
        i
      </NoPan>
    </PopoverTrigger>
  );
}
