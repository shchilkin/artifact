import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'aside' | 'div';
}

export function Panel({ as: Component = 'section', className, ...props }: PanelProps) {
  return <Component className={cn('artifact-panel', className)} {...props} />;
}

interface PanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
}

export function PanelHeader({ action, className, eyebrow, title, ...props }: PanelHeaderProps) {
  return (
    <div className={cn('artifact-panel-header', className)} {...props}>
      <div className="artifact-panel-header-copy">
        {eyebrow && <span className="artifact-panel-eyebrow">{eyebrow}</span>}
        <h3 className="artifact-panel-title">{title}</h3>
      </div>
      {action && <div className="artifact-panel-action">{action}</div>}
    </div>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('artifact-panel-body', className)} {...props} />;
}
