/**
 * Shortest time between two interactive preview frames during continuous input (about 15 frames per second).
 * Inspector sliders update the document at the same interval, since updates in between would not be rendered.
 */
export const PREVIEW_FRAME_INTERVAL_MS = 66;
