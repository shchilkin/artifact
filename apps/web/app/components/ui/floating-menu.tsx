import { Popover as PopoverPrimitive } from 'radix-ui';
import type * as React from 'react';
import { forwardRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './floating-menu.css';

interface FloatingMenuProps extends Omit<React.ComponentProps<typeof PopoverPrimitive.Content>, 'children'> {
  x: number;
  y: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export const FloatingMenu = forwardRef<HTMLDivElement, FloatingMenuProps>(function FloatingMenu(
  { x, y, open = true, onOpenChange, className, style, children, ...props },
  ref,
) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor
        className="artifact-floating-menu-anchor"
        style={{ left: x, top: y }}
        aria-hidden="true"
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          className={cn('artifact-floating-menu-content', className)}
          side="bottom"
          align="start"
          sideOffset={0}
          collisionPadding={8}
          style={style}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          {...props}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
