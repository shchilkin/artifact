import { type ButtonHTMLAttributes, forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('artifact-toolbar', className)} role="toolbar" {...props} />;
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn('artifact-toolbar-button', className)} {...props} />
  ),
);

ToolbarButton.displayName = 'ToolbarButton';
