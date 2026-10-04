import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, createZip, readZip } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('round-trips entries with nested and non-ASCII paths', () => {
    const entries = [
      { path: 'manifest.json', data: bytes('{"version":1}') },
      { path: 'plates/0.png', data: new Uint8Array([137, 80, 78, 71, 0, 255]) },
      { path: 'Вайбер.txt', data: bytes('ok') },
    ];
    const zip = createZip(entries);
    expect(readZip(zip)).toEqual(entries);
    // Deterministic: the same entries give the same bytes.
    expect(createZip(entries)).toEqual(zip);
  });

  it('is a zip that unzip accepts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-package-'));
    const file = join(dir, 'package.zip');
    writeFileSync(file, createZip([{ path: 'plates/0.png', data: bytes('plate') }]));
    let output: string;
    try {
      output = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    expect(output).toContain('No errors detected');
  });
});
