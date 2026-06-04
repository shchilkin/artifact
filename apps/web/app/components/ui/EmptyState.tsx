import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  actions?: ReactNode;
  body?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
}

export function EmptyState({ actions, body, className, eyebrow, title, ...props }: EmptyStateProps) {
  return (
    <div className={cn('artifact-empty-state', className)} {...props}>
      <div className="artifact-empty-state-copy">
        {eyebrow && <span className="artifact-empty-state-eyebrow">{eyebrow}</span>}
        <h3 className="artifact-empty-state-title">{title}</h3>
        {body && <p className="artifact-empty-state-body">{body}</p>}
      </div>
      {actions && <div className="artifact-empty-state-actions">{actions}</div>}
    </div>
  );
}
