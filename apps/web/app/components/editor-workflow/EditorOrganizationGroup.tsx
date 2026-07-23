import { type ComponentPropsWithoutRef, forwardRef } from 'react';

import { cn } from '@/lib/utils';

import './editor-workflow.css';

interface EditorOrganizationGroupProps extends ComponentPropsWithoutRef<'div'> {
  collapsed: boolean;
  editing?: boolean;
  empty?: boolean;
  label: string;
}

export const EditorOrganizationGroup = forwardRef<HTMLDivElement, EditorOrganizationGroupProps>(
  function EditorOrganizationGroup({ className, collapsed, editing, empty, label, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn('editor-organization-group', className)}
        role="group"
        aria-label={label}
        data-editor-organization-collapsed={collapsed ? 'true' : 'false'}
        data-editor-organization-editing={editing ? 'true' : 'false'}
        data-editor-organization-empty={empty ? 'true' : 'false'}
      />
    );
  },
);
