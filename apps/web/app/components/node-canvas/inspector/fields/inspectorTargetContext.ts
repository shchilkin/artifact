import { createContext } from 'react';

/**
 * Id of the layer or node the surrounding inspector edits. Controls that hold a value back (a coalesced slider)
 * pass it on to the previous target when this changes, instead of to the next one.
 */
export const InspectorTargetContext = createContext<string | null>(null);
