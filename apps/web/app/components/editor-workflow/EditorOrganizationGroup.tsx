import { type ComponentPropsWithoutRef, forwardRef } from 'react';

import { cn } from '@/lib/utils';

import './editor-workflow.css';

interface EditorOrganizationGroupProps extends ComponentPropsWithoutRef<'div'> {
  collapsed: boolean;
  disabled?: boolean;
  dragOver?: boolean;
  editing?: boolean;
  empty?: boolean;
  label: string;
  narrow?: boolean;
  selectedContent?: boolean;
  hiddenContent?: boolean;
}

type EditorOrganizationSlotProps = ComponentPropsWithoutRef<'div'>;

export function EditorOrganizationHeader({ className, ...props }: EditorOrganizationSlotProps) {
  return <div {...props} className={cn('editor-organization-group__header', className)} />;
}

export function EditorOrganizationIdentity({ className, ...props }: EditorOrganizationSlotProps) {
  return <div {...props} className={cn('editor-organization-group__identity', className)} />;
}

export function EditorOrganizationStatus({ className, ...props }: EditorOrganizationSlotProps) {
  return <div {...props} className={cn('editor-organization-group__status', className)} />;
}

export function EditorOrganizationActions({ className, ...props }: EditorOrganizationSlotProps) {
  return <div {...props} className={cn('editor-organization-group__actions', className)} />;
}

export function EditorOrganizationContent({ className, ...props }: EditorOrganizationSlotProps) {
  return <div {...props} className={cn('editor-organization-group__content', className)} />;
}

export const EditorOrganizationGroup = forwardRef<HTMLDivElement, EditorOrganizationGroupProps>(
  function EditorOrganizationGroup(
    {
      className,
      collapsed,
      disabled,
      dragOver,
      editing,
      empty,
      hiddenContent,
      label,
      narrow,
      selectedContent,
      ...props
    },
    ref,
  ) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn('editor-organization-group', className)}
        role="group"
        aria-label={label}
        aria-disabled={disabled || undefined}
        data-editor-organization-collapsed={collapsed ? 'true' : 'false'}
        data-editor-organization-disabled={disabled ? 'true' : 'false'}
        data-editor-organization-drag-over={dragOver ? 'true' : 'false'}
        data-editor-organization-editing={editing ? 'true' : 'false'}
        data-editor-organization-empty={empty ? 'true' : 'false'}
        data-editor-organization-hidden-content={hiddenContent ? 'true' : 'false'}
        data-editor-organization-narrow={narrow ? 'true' : 'false'}
        data-editor-organization-selected-content={selectedContent ? 'true' : 'false'}
      />
    );
  },
);
