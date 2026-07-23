import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

import './editor-workflow.css';

interface EditorCommandBarProps extends Omit<ComponentPropsWithoutRef<'div'>, 'aria-label' | 'role'> {
  density?: 'default' | 'compact';
  label: string;
  mobile?: boolean;
  overflowed?: boolean;
}

export function EditorCommandBar({
  className,
  density = 'default',
  label,
  mobile,
  overflowed,
  ...props
}: EditorCommandBarProps) {
  return (
    <div
      {...props}
      className={cn('editor-command-bar', className)}
      role="toolbar"
      aria-label={label}
      data-editor-command-density={density}
      data-editor-command-mobile={mobile ? 'true' : 'false'}
      data-editor-command-overflowed={overflowed ? 'true' : 'false'}
    />
  );
}
