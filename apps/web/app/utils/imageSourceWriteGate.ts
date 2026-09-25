/** Keeps an asynchronous asset-store completion from overwriting a later
 * image choice or a replacement document that happens to reuse a layer ID. */
export class ImageSourceWriteGate {
  private serials = new Map<string, number>();

  constructor(private currentDocumentEpoch: () => number) {}

  invalidateLayer(id: string): void {
    this.serials.set(id, (this.serials.get(id) ?? 0) + 1);
  }

  clear(): void {
    this.serials.clear();
  }

  async storeThenApply(
    id: string,
    source: string,
    store: (source: string) => Promise<string>,
    apply: (stored: string) => void,
  ): Promise<void> {
    this.invalidateLayer(id);
    const serial = this.serials.get(id);
    const epoch = this.currentDocumentEpoch();
    const stored = await store(source).catch(() => source);
    if (this.currentDocumentEpoch() === epoch && this.serials.get(id) === serial) apply(stored);
  }
}
