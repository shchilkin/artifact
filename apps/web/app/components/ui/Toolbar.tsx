import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('artifact-toolbar', className)} role="toolbar" {...props} />;
}

export function ToolbarButton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn('artifact-toolbar-button', className)} {...props} />;
}
