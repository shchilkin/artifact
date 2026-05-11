import type { ReactNode } from 'react';

import { NoPan } from '../../nodes/NoPan';

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
    <div className={`node-inspector-section${open ? ' node-inspector-section-open' : ''}`}>
      <NoPan
        as="button"
        type="button"
        className="node-section-button node-inspector-section-button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <div className="node-inspector-section-copy">
          <span className="node-inspector-section-title">{title}</span>
          {summary && <span className="node-inspector-section-summary">{summary}</span>}
        </div>
        <span className="node-inspector-section-toggle">{open ? '−' : '+'}</span>
      </NoPan>
      {open && <div className="node-inspector-section-body">{children}</div>}
    </div>
  );
}
