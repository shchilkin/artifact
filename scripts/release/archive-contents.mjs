// Compare an attached Mac app with the verified archive without extracting untrusted ZIP entries.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yauzl from 'yauzl';

const MAX_ENTRIES = 20_000;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const REQUIRED = [
  'Artifact.app/Contents/Info.plist',
  'Artifact.app/Contents/MacOS/ArtifactCorePilot',
  'Artifact.app/Contents/Resources/build-identity.json',
  'Artifact.app/Contents/_CodeSignature/CodeResources',
];

function validateName(name) {
  assert.ok(name.startsWith('Artifact.app/'), `ZIP entry outside Artifact.app: ${name}`);
  assert.ok(!/[\\\x00-\x1f\x7f]/.test(name), `Unsafe ZIP entry name: ${name}`);
  const parts = name.split('/');
  assert.ok(
    parts.every((part, index) => part || (index === parts.length - 1 && name.endsWith('/'))),
    `Unsafe ZIP entry name: ${name}`,
  );
  assert.ok(
    parts.every((part) => part !== '.' && part !== '..'),
    `Unsafe ZIP entry name: ${name}`,
  );
}

function validateSymlink(name, target) {
  assert.ok(target && !path.posix.isAbsolute(target) && !/[\\\x00-\x1f\x7f]/.test(target), `Unsafe symlink: ${name}`);
  const destination = path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
  assert.ok(
    destination === 'Artifact.app' || destination.startsWith('Artifact.app/'),
    `Symlink escapes Artifact.app: ${name}`,
  );
}

function openZip(file) {
  assert.ok(statSync(file).size <= MAX_ARCHIVE_BYTES, 'Oversized ZIP archive');
  return new Promise((resolve, reject) => {
    // Buffer-backed readers also keep large ditto-created entries readable on macOS.
    yauzl.fromBuffer(
      readFileSync(file),
      { lazyEntries: true, validateEntrySizes: true, autoClose: false },
      (error, zip) => (error ? reject(error) : resolve(zip)),
    );
  });
}

function nextEntry(zip) {
  return new Promise((resolve, reject) => {
    const onEntry = (entry) => finish(null, entry);
    const onEnd = () => finish(null, null);
    const onError = (error) => finish(error);
    function finish(error, entry) {
      zip.off('entry', onEntry);
      zip.off('end', onEnd);
      zip.off('error', onError);
      if (error) reject(error);
      else resolve(entry);
    }
    zip.once('entry', onEntry);
    zip.once('end', onEnd);
    zip.once('error', onError);
    zip.readEntry();
  });
}

function openEntry(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream)));
  });
}

export async function archiveContents(file) {
  const zip = await openZip(file);
  const contents = [];
  const names = new Set();
  let totalBytes = 0;
  try {
    for (;;) {
      const entry = await nextEntry(zip);
      if (!entry) break;
      assert.ok(contents.length < MAX_ENTRIES, 'Too many ZIP entries');
      assert.ok(!entry.isEncrypted(), `Encrypted ZIP entry: ${entry.fileName}`);
      const name = entry.fileName;
      validateName(name);
      assert.ok(!names.has(name), `Duplicate ZIP entry: ${name}`);
      names.add(name);
      assert.ok(entry.uncompressedSize <= MAX_ENTRY_BYTES, `Oversized ZIP entry: ${name}`);
      totalBytes += entry.uncompressedSize;
      assert.ok(totalBytes <= MAX_TOTAL_BYTES, 'Oversized ZIP archive');
      const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
      const kind = mode & 0o170000;
      const type = kind === 0o040000 ? 'directory' : kind === 0o100000 ? 'file' : kind === 0o120000 ? 'symlink' : null;
      assert.ok(type, `Unknown ZIP entry type: ${name}`);
      assert.equal(name.endsWith('/'), type === 'directory', `ZIP entry type/path mismatch: ${name}`);
      const digest = createHash('sha256');
      let bytes = 0;
      const symlinkChunks = [];
      if (type !== 'directory') {
        const stream = await openEntry(zip, entry);
        for await (const chunk of stream) {
          bytes += chunk.length;
          assert.ok(bytes <= MAX_ENTRY_BYTES, `Oversized ZIP entry: ${name}`);
          digest.update(chunk);
          if (type === 'symlink') {
            assert.ok(bytes <= 4096, `Oversized symlink: ${name}`);
            symlinkChunks.push(chunk);
          }
        }
      }
      assert.equal(bytes, entry.uncompressedSize, `ZIP size mismatch: ${name}`);
      if (type === 'symlink') validateSymlink(name, Buffer.concat(symlinkChunks).toString('utf8'));
      contents.push({ name, type, mode, sha256: digest.digest('hex') });
    }
    for (const name of REQUIRED) assert.ok(names.has(name), `Mac app missing ${name}`);
    return contents.sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    zip.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await archiveContents(process.argv[2])));
}
