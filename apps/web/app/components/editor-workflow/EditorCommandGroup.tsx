import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

import './editor-workflow.css';

interface EditorCommandGroupProps extends Omit<ComponentPropsWithoutRef<'div'>, 'aria-label' | 'role'> {
  label: string;
}

export function EditorCommandGroup({ className, label, ...props }: EditorCommandGroupProps) {
  return <div {...props} className={cn('editor-command-group', className)} role="group" aria-label={label} />;
}
