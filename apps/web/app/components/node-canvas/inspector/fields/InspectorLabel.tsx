import type { ReactNode } from 'react';

export function InspectorLabel({ children }: { children: ReactNode }) {
  return <span className="artifact-inspector-label">{children}</span>;
}
