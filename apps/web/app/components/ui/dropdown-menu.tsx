import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import type * as React from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

import './dropdown-menu.css';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;

const DropdownMenuContent = forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 8, collisionPadding = 10, ...props }, ref) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        className={cn('artifact-dropdown-menu-content', className)}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        {...props}
      />
    </DropdownMenuPortal>
  );
});

const DropdownMenuItem = forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn('artifact-dropdown-menu-item', destructive && 'artifact-dropdown-menu-item-danger', className)}
      {...props}
    />
  );
});

const DropdownMenuLabel = forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Label ref={ref} className={cn('artifact-dropdown-menu-label', className)} {...props} />;
});

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
