import { Button, ButtonLink, type ButtonLinkProps, type ButtonProps } from '@artifact/ui';
import { type ActionButtonVariant, actionButtonCompatibilityClassName } from './actionButtonClassName';
import './action-button.css';

interface SharedActionProps {
  variant?: ActionButtonVariant;
}

export function ActionButton({ className, variant = 'secondary', ...props }: ButtonProps & SharedActionProps) {
  return <Button className={actionButtonCompatibilityClassName({ className, variant })} variant={variant} {...props} />;
}

export function ActionLink({ className, variant = 'secondary', ...props }: ButtonLinkProps & SharedActionProps) {
  return (
    <ButtonLink className={actionButtonCompatibilityClassName({ className, variant })} variant={variant} {...props} />
  );
}
