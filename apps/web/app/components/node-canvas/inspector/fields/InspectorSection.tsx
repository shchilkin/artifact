import type { ReactNode } from 'react';

import { InspectorSection as ArtifactInspectorSection } from '../../../inspector-system';

export function InspectorSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <ArtifactInspectorSection
      className={`node-inspector-section${open ? ' node-inspector-section-open' : ''}`}
      density="dense"
      title={title}
      summary={summary}
      open={open}
      onToggle={onToggle}
      slotClassNames={{
        body: 'node-inspector-section-body',
        copy: 'node-inspector-section-copy',
        indicator: 'node-inspector-section-toggle',
        summary: 'node-inspector-section-summary',
        title: 'node-inspector-section-title',
        trigger: 'node-section-button node-inspector-section-button',
      }}
    >
      {children}
    </ArtifactInspectorSection>
  );
}
