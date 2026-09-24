import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

export function buildIdentity() {
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (sha.status !== 0 || !/^[0-9a-f]{40}\n?$/.test(sha.stdout))
    throw new Error('Cannot identify Git HEAD for native build');
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (status.status !== 0) throw new Error('Cannot determine native build worktree status');
  return { version, sha: sha.stdout.trim(), dirty: status.stdout.trim().length > 0 };
}
