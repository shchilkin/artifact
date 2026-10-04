import type { KeyboardEvent } from 'react';

const TABBABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Radix loops dialog focus only for a plain Tab. Safari moves between buttons with Option+Tab, which Radix lets
 * through, so focus stopped at the last control. This loops that case too, so every browser cycles the same way.
 */
export function loopOptionTabFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || event.key !== 'Tab' || !event.altKey) return;
  const tabbable = [...event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (element) => element.getClientRects().length > 0,
  );
  const first = tabbable[0];
  const last = tabbable.at(-1);
  if (!first || !last) return;
  if (document.activeElement !== (event.shiftKey ? first : last)) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}
