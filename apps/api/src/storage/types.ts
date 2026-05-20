export interface StoredAssetFile {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AssetStorage {
  writeImage(input: { assetId: string; bytes: Uint8Array; mimeType: string }): Promise<StoredAssetFile>;
  readImage(storageKey: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  deleteImage(storageKey: string): Promise<void>;
}
