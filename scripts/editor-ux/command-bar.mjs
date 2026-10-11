// Pure helpers for the command-bar first-edit metric, kept out of measure.mjs so they can be unit tested.

/**
 * Largest x movement of any command-bar button across the first edit. The measurement only means something when the
 * edit is what made Undo available, so an Undo that was already enabled fails the run instead of passing at once.
 * A button that appears or disappears counts as moving by its whole offset.
 */
export function firstEditMovePx({ undoEnabledBefore, before, after }) {
  if (undoEnabledBefore !== false) {
    throw new Error(
      `command-bar/firstEditMovePx: Undo must be disabled before the first edit (was ${undoEnabledBefore === true ? 'enabled' : 'not found'})`,
    );
  }
  let move = 0;
  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    move = Math.max(move, Math.abs((before[index] ?? 0) - (after[index] ?? 0)));
  }
  return move;
}
