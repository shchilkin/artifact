import { describe, expect, it, vi } from 'vitest';
import type { AiGenerationJob } from '../types/aiGeneration';
import { storeAiGeneratedAssetSource } from './aiGeneratedAssetImport';

const completeJob: AiGenerationJob = {
  id: 'job-1',
  status: 'succeeded',
  provider: 'openai',
  model: 'gpt-image',
  prompt: 'poster texture',
  settings: { aspect: '1:1', quality: 'standard' },
  asset: {
    id: 'asset-1',
    uri: 'https://api.example.test/assets/asset-1/file',
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    sizeBytes: 10,
    createdAt: '2026-05-20T10:00:00.000Z',
    metadata: {
      provider: 'openai',
      model: 'gpt-image',
      prompt: 'poster texture',
      settings: { aspect: '1:1', quality: 'standard' },
      createdAt: '2026-05-20T10:00:00.000Z',
    },
  },
  createdAt: '2026-05-20T10:00:00.000Z',
};

describe('storeAiGeneratedAssetSource', () => {
  it('returns existing local asset URIs without downloading', async () => {
    const fetcher = vi.fn();
    const src = await storeAiGeneratedAssetSource(
      {
        ...completeJob,
        asset: completeJob.asset && { ...completeJob.asset, uri: 'artifact-asset://local-asset' },
      },
      { fetcher },
    );

    expect(src).toBe('artifact-asset://local-asset');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stores data URLs through the existing asset store', async () => {
    const saveDataUrlAsset = vi.fn(async () => 'artifact-asset://stored-data-url');

    await expect(
      storeAiGeneratedAssetSource(
        {
          ...completeJob,
          asset: completeJob.asset && { ...completeJob.asset, uri: 'data:image/png;base64,AAAA' },
        },
        { saveDataUrlAsset },
      ),
    ).resolves.toBe('artifact-asset://stored-data-url');
    expect(saveDataUrlAsset).toHaveBeenCalledWith('data:image/png;base64,AAAA');
  });

  it('downloads remote assets with credentials and stores the image blob', async () => {
    const saveBlobAsset = vi.fn(async () => 'artifact-asset://stored-blob');
    const fetcher = vi.fn(async () => new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 }));

    await expect(storeAiGeneratedAssetSource(completeJob, { fetcher, saveBlobAsset })).resolves.toBe(
      'artifact-asset://stored-blob',
    );
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/assets/asset-1/file', {
      credentials: 'include',
      signal: undefined,
    });
    expect(saveBlobAsset).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('rejects incomplete jobs', async () => {
    await expect(storeAiGeneratedAssetSource({ ...completeJob, status: 'running', asset: undefined })).rejects.toThrow(
      'Generation job has no completed image asset.',
    );
  });
});
