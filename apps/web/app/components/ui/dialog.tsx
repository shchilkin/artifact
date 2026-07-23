import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import './dialog.css';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn('artifact-dialog-overlay', className)} {...props} />;
}

interface DialogContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  overlayClassName?: string;
}

function DialogContent({ className, children, overlayClassName, ...props }: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content className={cn('artifact-dialog-content', className)} {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger };
