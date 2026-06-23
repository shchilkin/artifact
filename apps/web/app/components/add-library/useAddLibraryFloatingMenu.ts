import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

import { clampPopupPosition } from '../node-canvas/helpers';

interface AddLibraryFloatingMenuOptions {
  width: number;
  height: number;
  offset?: number;
}

export function useAddLibraryFloatingMenu({ width, height, offset = 4 }: AddLibraryFloatingMenuOptions) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const toggle = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    const position = rect ? clampPopupPosition(rect.left, rect.bottom + offset, width, height) : { left: 8, top: 8 };
    setMenuPosition(position);
    setOpen((value) => !value);
  }, [height, offset, width]);

  const close = useCallback(() => setOpen(false), []);

  return {
    anchorRef,
    close,
    menuRef,
    menuStyle: { left: menuPosition.left, top: menuPosition.top } as CSSProperties,
    open,
    toggle,
  };
}
