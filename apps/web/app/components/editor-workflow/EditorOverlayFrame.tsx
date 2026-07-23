import { Popover, PopoverContent, PopoverTrigger } from '@artifact/ui';
import {
  type AriaRole,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
} from 'react';

import { cn } from '@/lib/utils';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { FloatingMenu } from '../ui/floating-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../ui/sheet';
import './editor-workflow.css';

interface EditorOverlayFrameProps {
  align?: 'start' | 'center' | 'end';
  busy?: boolean;
  children: ReactNode;
  className?: string;
  collisionAdjusted?: boolean;
  contentRef?: Ref<HTMLDivElement>;
  description: string;
  mobile?: boolean;
  mobileHeight?: string;
  onOpenChange: (open: boolean) => void;
  onEscapeKeyDown?: (event: { currentTarget: EventTarget | null; preventDefault: () => void }) => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onPointerDownOutside?: ComponentPropsWithoutRef<typeof FloatingMenu>['onPointerDownOutside'];
  open: boolean;
  openMethod?: 'keyboard' | 'pointer';
  overlayClassName?: string;
  position?: { x: number; y: number };
  role?: AriaRole;
  side?: 'top' | 'right' | 'bottom' | 'left';
  style?: CSSProperties;
  title: string;
  trigger?: ReactElement;
  variant?: 'adaptive' | 'dialog' | 'floating' | 'menu';
}

export function EditorOverlayFrame({
  align = 'end',
  busy = false,
  children,
  className,
  collisionAdjusted,
  contentRef,
  description,
  mobile = false,
  mobileHeight = '80vh',
  onOpenChange,
  onEscapeKeyDown,
  onKeyDown,
  onPointerDownOutside,
  open,
  openMethod,
  overlayClassName,
  position,
  role,
  side = 'bottom',
  style,
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
          ref={contentRef}
          className={cn(surfaceClassName, 'editor-overlay-frame--dialog')}
          overlayClassName={overlayClassName}
          aria-busy={busy || undefined}
          data-editor-overlay-method={openMethod}
          data-editor-overlay-state={open ? 'open' : 'closed'}
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
            onPointerDownOutside?.(event);
          }}
          onKeyDown={onKeyDown}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          {open ? children : null}
        </DialogContent>
      </Dialog>
    );
  }

  if (variant === 'menu') {
    if (!trigger) return null;
    return (
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          ref={contentRef}
          align={align}
          side={side}
          className={surfaceClassName}
          style={style}
          aria-label={title}
          aria-busy={busy || undefined}
          data-editor-overlay-method={openMethod}
          data-editor-overlay-state={open ? 'open' : 'closed'}
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          onKeyDown={onKeyDown}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          {open ? children : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === 'floating') {
    if (!position) return null;
    if (mobile) {
      return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent
            ref={contentRef}
            side="bottom"
            className={cn(surfaceClassName, 'editor-overlay-frame--sheet')}
            style={{ ...style, '--artifact-sheet-height': mobileHeight } as CSSProperties}
            aria-busy={busy || undefined}
            data-editor-overlay-method={openMethod}
            data-editor-overlay-state={open ? 'open' : 'closed'}
            onEscapeKeyDown={onEscapeKeyDown}
            onPointerDownOutside={onPointerDownOutside}
            onKeyDown={onKeyDown}
            onWheelCapture={(event) => event.stopPropagation()}
          >
            <SheetTitle className="sr-only">{title}</SheetTitle>
            <SheetDescription className="sr-only">{description}</SheetDescription>
            {open ? children : null}
          </SheetContent>
        </Sheet>
      );
    }
    return (
      <FloatingMenu
        ref={contentRef}
        open={open}
        onOpenChange={handleOpenChange}
        x={position.x}
        y={position.y}
        className={surfaceClassName}
        style={style}
        aria-label={title}
        aria-busy={busy || undefined}
        data-editor-overlay-method={openMethod}
        data-editor-overlay-state={open ? 'open' : 'closed'}
        onEscapeKeyDown={onEscapeKeyDown}
        onPointerDownOutside={onPointerDownOutside}
        onKeyDown={onKeyDown}
        role={role}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        {open ? children : null}
      </FloatingMenu>
    );
  }

  if (!trigger) return null;

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          ref={contentRef}
          side="bottom"
          className={cn(surfaceClassName, 'editor-overlay-frame--sheet')}
          style={{ ...style, '--artifact-sheet-height': mobileHeight } as CSSProperties}
          aria-busy={busy || undefined}
          data-editor-overlay-method={openMethod}
          data-editor-overlay-state={open ? 'open' : 'closed'}
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          onKeyDown={onKeyDown}
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
        ref={contentRef}
        align={align}
        side={side}
        sideOffset={4}
        collisionPadding={8}
        className={cn(surfaceClassName, 'editor-overlay-frame--popover')}
        style={style}
        aria-label={title}
        aria-busy={busy || undefined}
        data-editor-overlay-collision-adjusted={collisionAdjusted || undefined}
        data-editor-overlay-method={openMethod}
        data-editor-overlay-state={open ? 'open' : 'closed'}
        onEscapeKeyDown={onEscapeKeyDown}
        onPointerDownOutside={onPointerDownOutside}
        onKeyDown={onKeyDown}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        {open ? children : null}
      </PopoverContent>
    </Popover>
  );
}
