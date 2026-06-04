import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

type BadgeVariant = 'default' | 'selected' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn('artifact-badge', variant !== 'default' && `artifact-badge--${variant}`, className)}
      {...props}
    />
  );
}
