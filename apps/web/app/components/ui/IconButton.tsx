import { IconButton as FoundationIconButton, type IconButtonProps as FoundationIconButtonProps } from '@artifact/ui';

import { cn } from '@/lib/utils';

import './primitives.css';

type IconButtonVariant = 'secondary' | 'primary' | 'danger';
type IconButtonSize = 'default' | 'compact';

interface IconButtonProps extends Omit<FoundationIconButtonProps, 'size' | 'variant'> {
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
    <FoundationIconButton
      className={cn(
        'artifact-icon-button',
        size === 'compact' && 'artifact-icon-button--compact',
        variant !== 'secondary' && `artifact-icon-button--${variant}`,
        className,
      )}
      icon={icon}
      label={label}
      size={size}
      title={label}
      type={type}
      variant={variant}
      {...props}
    />
  );
}
