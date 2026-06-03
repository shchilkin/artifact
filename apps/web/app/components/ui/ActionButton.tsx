import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import { type ActionButtonVariant, actionButtonClassName } from './actionButtonClassName';
import './action-button.css';

interface SharedActionProps {
  variant?: ActionButtonVariant;
}

export function ActionButton({
  className,
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & SharedActionProps) {
  return <button type={type} className={actionButtonClassName({ className, variant })} {...props} />;
}

export function ActionLink({ className, variant = 'secondary', ...props }: LinkProps & SharedActionProps) {
  return <Link className={actionButtonClassName({ className, variant })} {...props} />;
}
