import { type ComponentPropsWithoutRef, type ReactNode, useId } from 'react';

import { cn } from '@/lib/utils';

import { type InspectorStateProps, inspectorStateAttributes, inspectorStateLabels } from './inspectorState';
import './inspector-system.css';

export type InspectorDensity = 'ordinary' | 'dense';

interface InspectorSectionProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'>, InspectorStateProps {
  children: ReactNode;
  density?: InspectorDensity;
  onToggle: () => void;
  open: boolean;
  slotClassNames?: {
    body?: string;
    copy?: string;
    indicator?: string;
    meta?: string;
    summary?: string;
    title?: string;
    trigger?: string;
  };
  summary?: ReactNode;
  title: ReactNode;
}

export function InspectorSection({
  children,
  className,
  density = 'ordinary',
  dirty = false,
  disabled = false,
  loading = false,
  locked = false,
  onToggle,
  open,
  slotClassNames,
  summary,
  title,
  validation = 'idle',
  ...props
}: InspectorSectionProps) {
  const generatedId = useId();
  const bodyId = `artifact-inspector-section-${generatedId}`;
  const state = { dirty, disabled, loading, locked, validation };
  const stateLabels = inspectorStateLabels(state);

  return (
    <section
      {...props}
      className={cn('artifact-inspector-section', className)}
      data-inspector-section="true"
      data-inspector-density={density}
      data-inspector-open={open ? 'true' : 'false'}
      {...inspectorStateAttributes(state)}
    >
      <button
        className={cn('artifact-inspector-section__trigger nodrag nopan nowheel', slotClassNames?.trigger)}
        type="button"
        aria-controls={bodyId}
        aria-expanded={open}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className={cn('artifact-inspector-section__copy', slotClassNames?.copy)}>
          <span className={cn('artifact-inspector-section__title', slotClassNames?.title)}>{title}</span>
          {summary ? (
            <span className={cn('artifact-inspector-section__summary', slotClassNames?.summary)}>{summary}</span>
          ) : null}
        </span>
        <span className={cn('artifact-inspector-section__meta', slotClassNames?.meta)}>
          {stateLabels.map((label) => (
            <span className="artifact-inspector-section__state" key={label}>
              {label}
            </span>
          ))}
          <span className={cn('artifact-inspector-section__indicator', slotClassNames?.indicator)} aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </span>
      </button>
      {open ? (
        <div className={cn('artifact-inspector-section__body', slotClassNames?.body)} id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
