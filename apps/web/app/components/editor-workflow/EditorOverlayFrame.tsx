import { Popover, PopoverContent, PopoverTrigger } from '@artifact/ui';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../ui/sheet';
import './editor-workflow.css';

interface EditorOverlayFrameProps {
  children: ReactNode;
  className?: string;
  description: string;
  mobile: boolean;
  mobileHeight?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  trigger: ReactElement;
}

export function EditorOverlayFrame({
  children,
  className,
  description,
  mobile,
  mobileHeight = '80vh',
  onOpenChange,
  open,
  title,
  trigger,
}: EditorOverlayFrameProps) {
  const surfaceClassName = cn('editor-overlay-frame', className);

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className={cn(surfaceClassName, 'editor-overlay-frame--sheet')}
          style={{ '--artifact-sheet-height': mobileHeight } as CSSProperties}
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
          {open ? children : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        className={cn(surfaceClassName, 'editor-overlay-frame--popover')}
        aria-label={title}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        {open ? children : null}
      </PopoverContent>
    </Popover>
  );
}
