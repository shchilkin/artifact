import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid = false, ...props }: InputProps) {
  return <input className={cn('artifact-input', invalid && 'artifact-input--error', className)} {...props} />;
}
