let idCounter = 0;

/** A new unique layer id. */
export function genId(): string {
  return `layer-${Date.now()}-${idCounter++}`;
}
