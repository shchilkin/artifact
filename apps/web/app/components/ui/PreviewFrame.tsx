import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './primitives.css';

type PreviewFrameTone = 'default' | 'selected' | 'muted';

interface PreviewFrameProps extends HTMLAttributes<HTMLDivElement> {
  footer?: ReactNode;
  label?: ReactNode;
  tone?: PreviewFrameTone;
}

export function PreviewFrame({ children, className, footer, label, tone = 'default', ...props }: PreviewFrameProps) {
  return (
    <div className={cn('artifact-preview-frame', `artifact-preview-frame--${tone}`, className)} {...props}>
      {label && <div className="artifact-preview-frame-label">{label}</div>}
      <div className="artifact-preview-frame-body">{children}</div>
      {footer && <div className="artifact-preview-frame-footer">{footer}</div>}
    </div>
  );
}
