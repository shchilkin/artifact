import type { ReactNode } from 'react';

export function InspectorLabel({ children }: { children: ReactNode }) {
  return <span className="node-inspector-label">{children}</span>;
}
