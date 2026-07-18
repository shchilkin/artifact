import { Button, type ButtonProps } from '@artifact/ui';
import { Link, type LinkProps } from 'react-router';
import {
  type ActionButtonVariant,
  actionButtonClassName,
  actionButtonCompatibilityClassName,
} from './actionButtonClassName';
import './action-button.css';

interface SharedActionProps {
  variant?: ActionButtonVariant;
}

export function ActionButton({ className, variant = 'secondary', ...props }: ButtonProps & SharedActionProps) {
  return <Button className={actionButtonCompatibilityClassName({ className, variant })} variant={variant} {...props} />;
}

export function ActionLink({ className, variant = 'secondary', ...props }: LinkProps & SharedActionProps) {
  return <Link className={actionButtonClassName({ className, variant })} {...props} />;
}
