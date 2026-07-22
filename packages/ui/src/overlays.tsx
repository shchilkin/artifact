import { Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ComponentPropsWithRef } from 'react';

export type TooltipProviderProps = ComponentPropsWithRef<typeof TooltipPrimitive.Provider>;

export function TooltipProvider(props: TooltipProviderProps) {
  return <TooltipPrimitive.Provider {...props} />;
}

export type TooltipProps = ComponentPropsWithRef<typeof TooltipPrimitive.Root>;

export function Tooltip(props: TooltipProps) {
  return <TooltipPrimitive.Root {...props} />;
}

export type TooltipTriggerProps = ComponentPropsWithRef<typeof TooltipPrimitive.Trigger>;

export function TooltipTrigger(props: TooltipTriggerProps) {
  return <TooltipPrimitive.Trigger {...props} />;
}

export type TooltipContentProps = ComponentPropsWithRef<typeof TooltipPrimitive.Content>;

export function TooltipContent({ className, collisionPadding = 8, sideOffset = 8, ...props }: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={joinClassNames('ui-tooltip-content', className)}
        collisionPadding={collisionPadding}
        sideOffset={sideOffset}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export type PopoverProps = ComponentPropsWithRef<typeof PopoverPrimitive.Root>;

export function Popover(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

export type PopoverTriggerProps = ComponentPropsWithRef<typeof PopoverPrimitive.Trigger>;

export function PopoverTrigger(props: PopoverTriggerProps) {
  return <PopoverPrimitive.Trigger {...props} />;
}

export type PopoverContentProps = ComponentPropsWithRef<typeof PopoverPrimitive.Content>;

export function PopoverContent({ className, collisionPadding = 12, sideOffset = 8, ...props }: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        className={joinClassNames('ui-popover-content', className)}
        collisionPadding={collisionPadding}
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export type PopoverCloseProps = ComponentPropsWithRef<typeof PopoverPrimitive.Close>;

export function PopoverClose(props: PopoverCloseProps) {
  return <PopoverPrimitive.Close {...props} />;
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}
