import type { ReactNode } from 'react';

import { InspectorSection as ArtifactInspectorSection } from '../../../inspector-system';
import { useInspectorStateContext } from './useInspectorStateContext';

export function InspectorSection({
  title,
  summary,
  open,
  dirty,
  locked,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  dirty?: boolean;
  locked?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const inheritedState = useInspectorStateContext();

  return (
    <ArtifactInspectorSection
      className={`artifact-inspector-section${open ? ' artifact-inspector-section-open' : ''}`}
      density="dense"
      dirty={dirty ?? inheritedState.dirty}
      locked={locked ?? inheritedState.locked}
      title={title}
      summary={summary}
      open={open}
      onToggle={onToggle}
      slotClassNames={{
        body: 'artifact-inspector-section-body',
        copy: 'artifact-inspector-section-copy',
        indicator: 'artifact-inspector-section-toggle',
        summary: 'artifact-inspector-section-summary',
        title: 'artifact-inspector-section-title',
        trigger: 'node-section-button artifact-inspector-section-button',
      }}
    >
      {children}
    </ArtifactInspectorSection>
  );
}
