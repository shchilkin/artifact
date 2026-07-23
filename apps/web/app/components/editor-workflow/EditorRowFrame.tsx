import { type ComponentPropsWithoutRef, forwardRef } from 'react';

import { cn } from '@/lib/utils';

import './editor-workflow.css';

interface EditorRowFrameProps extends ComponentPropsWithoutRef<'div'> {
  disabled?: boolean;
  dropPosition?: 'before' | 'after' | null;
  dragging?: boolean;
  editing?: boolean;
  isHidden?: boolean;
  isLocked?: boolean;
  keyboardActive?: boolean;
  nested?: boolean;
  selected?: boolean;
}

export const EditorRowFrame = forwardRef<HTMLDivElement, EditorRowFrameProps>(function EditorRowFrame(
  {
    className,
    disabled,
    dropPosition,
    dragging,
    editing,
    isHidden,
    isLocked,
    keyboardActive,
    nested,
    selected,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn('editor-row-frame', className)}
      aria-disabled={disabled || undefined}
      data-editor-row-disabled={disabled ? 'true' : 'false'}
      data-editor-row-selected={selected ? 'true' : 'false'}
      data-editor-row-hidden={isHidden ? 'true' : 'false'}
      data-editor-row-locked={isLocked ? 'true' : 'false'}
      data-editor-row-nested={nested ? 'true' : 'false'}
      data-editor-row-editing={editing ? 'true' : 'false'}
      data-editor-row-dragging={dragging ? 'true' : 'false'}
      data-editor-row-keyboard-active={keyboardActive ? 'true' : 'false'}
      data-editor-row-drop={dropPosition ?? 'none'}
    />
  );
});
