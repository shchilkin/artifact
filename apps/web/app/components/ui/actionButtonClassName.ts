import { commandClassName } from '@artifact/ui';

export type ActionButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface ActionButtonClassOptions {
  active?: boolean;
  className?: string;
  variant?: ActionButtonVariant;
}

export function actionButtonClassName({ active = false, className, variant = 'secondary' }: ActionButtonClassOptions) {
  return commandClassName(variant, actionButtonCompatibilityClassName({ active, className, variant }));
}

export function actionButtonCompatibilityClassName({
  active = false,
  className,
  variant = 'secondary',
}: ActionButtonClassOptions) {
  return ['action-button', `action-button--${variant}`, active ? 'action-button--active' : '', className]
    .filter(Boolean)
    .join(' ');
}
