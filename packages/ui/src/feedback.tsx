import type { ComponentPropsWithRef } from 'react';

export type InlineNoticeVariant = 'info' | 'success' | 'warning' | 'danger';

export interface InlineNoticeProps extends ComponentPropsWithRef<'div'> {
  variant?: InlineNoticeVariant;
}

export function InlineNotice({ className, role, variant = 'info', ...props }: InlineNoticeProps) {
  return (
    <div
      {...props}
      className={joinClassNames('ui-inline-notice', `ui-inline-notice--${variant}`, className)}
      role={role ?? (variant === 'danger' ? 'alert' : 'status')}
    />
  );
}

export type SkeletonShape = 'line' | 'block';

export interface SkeletonProps extends Omit<ComponentPropsWithRef<'div'>, 'aria-label'> {
  label?: string;
  shape?: SkeletonShape;
}

export function Skeleton({
  'aria-hidden': ariaHidden,
  'aria-live': ariaLive,
  className,
  label,
  role,
  shape = 'line',
  ...props
}: SkeletonProps) {
  const announcesLoading = Boolean(label);

  return (
    <div
      {...props}
      className={joinClassNames('ui-skeleton', `ui-skeleton--${shape}`, className)}
      role={role ?? (announcesLoading ? 'status' : undefined)}
      aria-live={ariaLive ?? (announcesLoading ? 'polite' : undefined)}
      aria-label={label}
      aria-hidden={ariaHidden ?? (announcesLoading ? undefined : true)}
    />
  );
}

export interface ProgressIndicatorProps
  extends Omit<ComponentPropsWithRef<'div'>, 'aria-label' | 'aria-valuemax' | 'aria-valuemin' | 'aria-valuenow'> {
  label: string;
  max?: number;
  value?: number;
}

export function ProgressIndicator({ className, label, max = 100, value, ...props }: ProgressIndicatorProps) {
  const isDeterminate = value !== undefined;
  const resolvedMax = Number.isFinite(max) && max > 0 ? max : 100;
  const resolvedValue = isDeterminate ? Math.min(resolvedMax, Math.max(0, Number.isFinite(value) ? value : 0)) : 0;
  const percentage = (resolvedValue / resolvedMax) * 100;

  return (
    <div
      {...props}
      className={joinClassNames(
        'ui-progress-indicator',
        isDeterminate ? 'ui-progress-indicator--determinate' : 'ui-progress-indicator--indeterminate',
        className,
      )}
      role="progressbar"
      aria-label={label}
      aria-busy={isDeterminate ? undefined : true}
      aria-valuemin={isDeterminate ? 0 : undefined}
      aria-valuemax={isDeterminate ? resolvedMax : undefined}
      aria-valuenow={isDeterminate ? resolvedValue : undefined}
    >
      <span
        className="ui-progress-indicator__value"
        style={isDeterminate ? { width: `${percentage}%` } : undefined}
        aria-hidden="true"
      />
    </div>
  );
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}
