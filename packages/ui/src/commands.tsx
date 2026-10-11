import type { ComponentPropsWithRef, MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router';
import { commandClassName } from './command-class-name';

export type CommandVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'danger-filled';
export type CommandSize = 'default' | 'compact';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /**
   * Text shown instead of the label while `loading`, in place of the spinner. Both labels share one cell, so the
   * command keeps the wider label's width and nothing around it moves.
   */
  busyLabel?: ReactNode;
  loading?: boolean;
  size?: CommandSize;
  variant?: CommandVariant;
}

export function Button({
  busyLabel,
  children,
  className,
  disabled,
  loading = false,
  size = 'default',
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      type={type}
      className={commandClassName(variant, className, size)}
      disabled={disabled || loading}
    >
      {busyLabel === undefined ? (
        <>
          {loading ? <span className="ui-command__progress" aria-hidden="true" /> : null}
          {children}
        </>
      ) : (
        <span className="ui-command__labels">
          <span className="ui-command__label" data-active={!loading}>
            {children}
          </span>
          <span className="ui-command__label" data-active={loading}>
            {busyLabel}
          </span>
        </span>
      )}
    </button>
  );
}

export type ButtonLinkProps = ComponentPropsWithRef<typeof Link> & {
  disabled?: boolean;
  size?: CommandSize;
  variant?: CommandVariant;
};

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
    <Link
      {...props}
      aria-disabled={disabled || undefined}
      className={commandClassName(variant, className, size)}
      onClick={handleClick}
      tabIndex={disabled ? -1 : tabIndex}
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
