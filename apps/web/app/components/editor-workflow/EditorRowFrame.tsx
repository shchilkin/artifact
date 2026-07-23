import { type ComponentPropsWithoutRef, forwardRef } from 'react';

import { cn } from '@/lib/utils';

import './editor-workflow.css';

interface EditorRowFrameProps extends ComponentPropsWithoutRef<'div'> {
  dropPosition?: 'before' | 'after' | null;
  editing?: boolean;
  isHidden?: boolean;
  isLocked?: boolean;
  nested?: boolean;
  selected?: boolean;
}

export const EditorRowFrame = forwardRef<HTMLDivElement, EditorRowFrameProps>(function EditorRowFrame(
  { className, dropPosition, editing, isHidden, isLocked, nested, selected, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn('editor-row-frame', className)}
      data-editor-row-selected={selected ? 'true' : 'false'}
      data-editor-row-hidden={isHidden ? 'true' : 'false'}
      data-editor-row-locked={isLocked ? 'true' : 'false'}
      data-editor-row-nested={nested ? 'true' : 'false'}
      data-editor-row-editing={editing ? 'true' : 'false'}
      data-editor-row-drop={dropPosition ?? 'none'}
    />
  );
});
