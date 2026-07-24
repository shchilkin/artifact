import { createContext } from 'react';

import type { InspectorStateProps } from '../../../inspector-system';

export const InspectorStateContext = createContext<InspectorStateProps>({});
