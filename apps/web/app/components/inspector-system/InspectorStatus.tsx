import { InlineNotice, type InlineNoticeProps, ProgressIndicator } from '@artifact/ui';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './inspector-system.css';

interface InspectorStatusProps extends Omit<InlineNoticeProps, 'title' | 'variant'> {
  children: ReactNode;
  loading?: boolean;
  title: ReactNode;
  tone?: NonNullable<InlineNoticeProps['variant']>;
}

export function InspectorStatus({
  children,
  className,
  loading = false,
  title,
  tone = 'info',
  ...props
}: InspectorStatusProps) {
  return (
    <InlineNotice
      {...props}
      className={cn('artifact-inspector-status', className)}
      variant={tone}
      data-inspector-status={tone}
      data-inspector-loading={loading ? 'true' : 'false'}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <ProgressIndicator
          className="artifact-inspector-status__progress"
          label={typeof title === 'string' ? title : 'Working'}
        />
      ) : null}
      <span className="artifact-inspector-status__copy">
        <strong className="artifact-inspector-status__title">{title}</strong>
        <span className="artifact-inspector-status__message">{children}</span>
      </span>
    </InlineNotice>
  );
}
