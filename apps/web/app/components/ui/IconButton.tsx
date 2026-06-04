import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

type IconButtonVariant = 'secondary' | 'primary' | 'danger';
type IconButtonSize = 'default' | 'compact';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
}

export function IconButton({
  className,
  icon,
  label,
  size = 'default',
  type = 'button',
  variant = 'secondary',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'artifact-icon-button',
        size === 'compact' && 'artifact-icon-button--compact',
        variant !== 'secondary' && `artifact-icon-button--${variant}`,
        className,
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      {icon}
    </button>
  );
}
