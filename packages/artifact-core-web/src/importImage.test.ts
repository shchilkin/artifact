import { afterEach, describe, expect, it, vi } from 'vitest';
import { importImage } from './importImage';

const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function file(bytes: Uint8Array = header) {
  return new File([new Uint8Array(bytes).buffer], 'image.png', { type: 'image/png' });
}
afterEach(() => vi.unstubAllGlobals());

describe('image import boundary', () => {
  it('rejects oversized files and non-raster content before decoding', async () => {
    const image = vi.fn();
    vi.stubGlobal('Image', image);
    await expect(importImage(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png'))).rejects.toThrow('8 MiB');
    await expect(importImage(file(new TextEncoder().encode('<svg></svg>')))).rejects.toThrow('PNG or JPEG');
    expect(image).not.toHaveBeenCalled();
  });
  it('rejects failed decodes and releases the object URL', async () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: revoke });
    vi.stubGlobal(
      'Image',
      class {
        async decode() {
          throw new Error('decode failed');
        }
      },
    );
    await expect(importImage(file())).rejects.toThrow('decode failed');
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
  it('rejects oversized dimensions before allocating an output canvas', async () => {
    const create = vi.fn();
    const revoke = vi.fn();
    vi.stubGlobal('document', { createElement: create });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:large', revokeObjectURL: revoke });
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 4097;
        naturalHeight = 1;
        async decode() {}
      },
    );
    await expect(importImage(file())).rejects.toThrow('4096');
    expect(create).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:large');
  });
});
