import { Popover, PopoverContent, PopoverTrigger } from '@artifact/ui';
import { type CSSProperties, type ReactElement, type ReactNode, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../ui/sheet';
import './editor-workflow.css';

interface EditorOverlayFrameProps {
  busy?: boolean;
  children: ReactNode;
  className?: string;
  description: string;
  mobile?: boolean;
  mobileHeight?: string;
  onOpenChange: (open: boolean) => void;
  onEscapeKeyDown?: (event: { currentTarget: EventTarget | null; preventDefault: () => void }) => void;
  open: boolean;
  overlayClassName?: string;
  title: string;
  trigger?: ReactElement;
  variant?: 'adaptive' | 'dialog';
}

export function EditorOverlayFrame({
  busy = false,
  children,
  className,
  description,
  mobile = false,
  mobileHeight = '80vh',
  onOpenChange,
  onEscapeKeyDown,
  open,
  overlayClassName,
  title,
  trigger,
  variant = 'adaptive',
}: EditorOverlayFrameProps) {
  const surfaceClassName = cn('editor-overlay-frame', className);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(
    () => () => {
      const returnFocusTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnFocusTarget?.isConnected) queueMicrotask(() => returnFocusTarget.focus());
    },
    [],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy) return;
    const returnFocusTarget = !nextOpen ? returnFocusRef.current : null;
    if (!nextOpen) returnFocusRef.current = null;
    onOpenChange(nextOpen);
    if (returnFocusTarget) queueMicrotask(() => returnFocusTarget.focus());
  };

  if (variant === 'dialog') {
    return (
      <Dialog modal={false} open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(surfaceClassName, 'editor-overlay-frame--dialog')}
          overlayClassName={overlayClassName}
          onOpenAutoFocus={() => {
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : returnFocusRef.current;
          }}
          onCloseAutoFocus={(event) => {
            const returnFocusTarget = returnFocusRef.current;
            returnFocusRef.current = null;
            if (!returnFocusTarget) return;
            event.preventDefault();
            returnFocusTarget.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
            onEscapeKeyDown?.(event);
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          {open ? children : null}
        </DialogContent>
      </Dialog>
    );
  }

  if (!trigger) return null;

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className={cn(surfaceClassName, 'editor-overlay-frame--sheet')}
          style={{ '--artifact-sheet-height': mobileHeight } as CSSProperties}
          onEscapeKeyDown={onEscapeKeyDown}
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
          {open ? children : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        className={cn(surfaceClassName, 'editor-overlay-frame--popover')}
        aria-label={title}
        onEscapeKeyDown={onEscapeKeyDown}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        {open ? children : null}
      </PopoverContent>
    </Popover>
  );
}
