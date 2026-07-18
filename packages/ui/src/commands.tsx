import type { ComponentPropsWithRef, MouseEventHandler, ReactNode } from 'react';
import { commandClassName } from './command-class-name';

export type CommandVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type CommandSize = 'default' | 'compact';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  size?: CommandSize;
  variant?: CommandVariant;
}

export function Button({ className, size = 'default', type = 'button', variant = 'secondary', ...props }: ButtonProps) {
  return <button type={type} className={commandClassName(variant, className, size)} {...props} />;
}

export interface ButtonLinkProps extends ComponentPropsWithRef<'a'> {
  disabled?: boolean;
  size?: CommandSize;
  variant?: CommandVariant;
}

export function ButtonLink({
  className,
  disabled = false,
  onClick,
  size = 'default',
  tabIndex,
  variant = 'secondary',
  ...props
}: ButtonLinkProps) {
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <a
      aria-disabled={disabled || undefined}
      className={commandClassName(variant, className, size)}
      onClick={handleClick}
      tabIndex={disabled ? -1 : tabIndex}
      {...props}
    />
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'aria-label' | 'children'> {
  icon: ReactNode;
  label: string;
}

export function IconButton({ className, icon, label, ...props }: IconButtonProps) {
  return (
    <Button aria-label={label} className={['ui-icon-command', className].filter(Boolean).join(' ')} {...props}>
      <span className="ui-command__icon" aria-hidden="true">
        {icon}
      </span>
    </Button>
  );
}
