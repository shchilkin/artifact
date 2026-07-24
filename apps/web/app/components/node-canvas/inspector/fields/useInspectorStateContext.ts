import { useContext } from 'react';

import { InspectorStateContext } from './inspectorStateContext';

export function useInspectorStateContext() {
  return useContext(InspectorStateContext);
}
