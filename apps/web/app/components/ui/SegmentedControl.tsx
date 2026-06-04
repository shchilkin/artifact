import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

export function SegmentedControl({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('artifact-segmented-control', className)} role="group" {...props} />;
}

export function SegmentedControlTrigger({
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn('artifact-segmented-trigger', className)} {...props} />;
}
