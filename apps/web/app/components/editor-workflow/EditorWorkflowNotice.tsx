import { InlineNotice, type InlineNoticeProps } from '@artifact/ui';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './editor-workflow.css';

interface EditorWorkflowNoticeProps extends Omit<InlineNoticeProps, 'children'> {
  action?: ReactNode;
  children: ReactNode;
}

export function EditorWorkflowNotice({ action, children, className, ...props }: EditorWorkflowNoticeProps) {
  return (
    <InlineNotice {...props} className={cn('editor-workflow-notice', className)}>
      <div className="editor-workflow-notice__content">{children}</div>
      {action ? <div className="editor-workflow-notice__action">{action}</div> : null}
    </InlineNotice>
  );
}
