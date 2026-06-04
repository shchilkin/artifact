import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router';
import { type ActionButtonVariant, actionButtonClassName } from './actionButtonClassName';
import './action-button.css';

interface SharedActionProps {
  variant?: ActionButtonVariant;
}

export const ActionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & SharedActionProps>(
  ({ className, type = 'button', variant = 'secondary', ...props }, ref) => (
    <button ref={ref} type={type} className={actionButtonClassName({ className, variant })} {...props} />
  ),
);

ActionButton.displayName = 'ActionButton';

export const ActionLink = forwardRef<HTMLAnchorElement, LinkProps & SharedActionProps>(
  ({ className, variant = 'secondary', ...props }, ref) => (
    <Link ref={ref} className={actionButtonClassName({ className, variant })} {...props} />
  ),
);

ActionLink.displayName = 'ActionLink';
