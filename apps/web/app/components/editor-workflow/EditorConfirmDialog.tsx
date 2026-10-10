import { Button } from '@artifact/ui';
import { type ReactNode, type RefObject, useRef } from 'react';

import { cn } from '@/lib/utils';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import './editor-workflow.css';

export interface EditorConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Danger styles the confirm action for work that is removed or replaced. */
  tone?: 'default' | 'danger';
}

interface EditorConfirmDialogProps extends EditorConfirmRequest {
  open: boolean;
  /** The confirm action shows progress and exposes aria-busy; both actions are disabled. */
  busy?: boolean;
  children?: ReactNode;
  className?: string;
  /** Element to focus after closing when the opener is no longer focusable, such as a closed menu item. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Modal confirmation for replacing or destructive editor actions.
 * Focus is trapped, Escape and the overlay cancel, and Cancel takes the initial focus,
 * so pressing Enter right after the dialog opens never runs the confirmed action.
 */
export function EditorConfirmDialog({
  busy = false,
  cancelLabel = 'Cancel',
  children,
  className,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  returnFocusRef,
  title,
  tone = 'default',
}: EditorConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        className={cn('editor-confirm-dialog', className)}
        overlayClassName="editor-confirm-dialog__overlay"
        data-editor-confirm-tone={tone}
        aria-busy={busy || undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // There is no Radix trigger, so focus goes back to the control that opened the dialog.
          const explicitTarget = returnFocusRef?.current;
          const target = explicitTarget?.isConnected ? explicitTarget : openerRef.current;
          openerRef.current = null;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogTitle className="editor-confirm-dialog__title">{title}</DialogTitle>
        <DialogDescription className="editor-confirm-dialog__description">{description}</DialogDescription>
        {children}
        <div className="editor-confirm-dialog__actions">
          <Button ref={cancelRef} variant="quiet" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            className="editor-confirm-dialog__confirm"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
