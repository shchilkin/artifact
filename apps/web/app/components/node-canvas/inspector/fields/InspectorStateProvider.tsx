import type { ReactNode } from 'react';

import type { InspectorStateProps } from '../../../inspector-system';
import { InspectorStateContext } from './inspectorStateContext';

export function InspectorStateProvider({ children, value }: { children: ReactNode; value: InspectorStateProps }) {
  return <InspectorStateContext.Provider value={value}>{children}</InspectorStateContext.Provider>;
}
