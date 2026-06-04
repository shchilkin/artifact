import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

type MenuItemVariant = 'default' | 'danger';

interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  hint?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  variant?: MenuItemVariant;
}

export function MenuItem({
  className,
  hint,
  icon,
  label,
  type = 'button',
  variant = 'default',
  ...props
}: MenuItemProps) {
  return (
    <button
      type={type}
      className={cn('artifact-menu-item', variant !== 'default' && `artifact-menu-item--${variant}`, className)}
      {...props}
    >
      {icon && <span className="artifact-menu-item-icon">{icon}</span>}
      <span className="artifact-menu-item-label">{label}</span>
      {hint && <span className="artifact-menu-item-hint">{hint}</span>}
    </button>
  );
}

export function MenuDivider() {
  return <div className="artifact-menu-divider" role="separator" />;
}
