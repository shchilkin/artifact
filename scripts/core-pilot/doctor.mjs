import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const toolchain = readFileSync(path.join(root, 'rust-toolchain.toml'), 'utf8');
const lock = readFileSync(path.join(root, 'Cargo.lock'), 'utf8');
const packageManager = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).packageManager;
const requiredRust = toolchain.match(/channel\s*=\s*"([^"]+)"/)?.[1];
const requiredBindgen = lock.match(/name = "wasm-bindgen"\nversion = "([^"]+)"/)?.[1];
const requiredNpm = packageManager?.match(/^npm@(\d+)\./)?.[1];
if (!requiredRust || !requiredBindgen || !requiredNpm) throw new Error('Pinned build tool version is missing');

export function supportsNodeVersion(version) {
  const match = version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (major === 20 && minor >= 19) || major > 22 || (major === 22 && minor >= 12);
}

export function inspect({
  mode = 'all',
  run = spawnSync,
  platform = process.platform,
  arch = process.arch,
  hasFile = existsSync,
} = {}) {
  if (!['all', 'web', 'wasm', 'macos'].includes(mode)) throw new Error('Expected all, web, wasm, or macos');
  const problems = [];
  const results = [];
  const command = (name, args, label, expected) => {
    const result = run(name, args, { cwd: root, encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      problems.push(`${label} is missing or failed. ${name} ${args.join(' ')}`);
      return '';
    }
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    results.push(`${label}: ${output.split('\n')[0]}`);
    if (expected && !expected.test(output))
      problems.push(`${label} has an unexpected version: ${output.split('\n')[0]}`);
    return output;
  };
  const nodeVersion = command('node', ['--version'], 'Node.js');
  if (nodeVersion && !supportsNodeVersion(nodeVersion))
    problems.push('Node.js ^20.19.0 or >=22.12.0 is required by the current Web toolchain.');
  command('npm', ['--version'], 'npm', new RegExp(`^${requiredNpm}\\.`));
  if (mode !== 'web') {
    command('cargo', ['--version'], 'Cargo', new RegExp(`^cargo ${requiredRust.replaceAll('.', '\\.')}`));
    command('rustc', ['--version'], 'Rust', new RegExp(`^rustc ${requiredRust.replaceAll('.', '\\.')}`));
    const installed = command('rustup', ['target', 'list', '--installed'], 'Rust targets');
    if ((mode === 'wasm' || mode === 'all') && !installed.split('\n').includes('wasm32-unknown-unknown'))
      problems.push('Rust target wasm32-unknown-unknown is missing. Run rustup target add wasm32-unknown-unknown.');
    if ((mode === 'macos' || mode === 'all') && !installed.split('\n').includes('aarch64-apple-darwin'))
      problems.push('Rust target aarch64-apple-darwin is missing. Run rustup target add aarch64-apple-darwin.');
  }
  if (mode === 'wasm' || mode === 'all') {
    const local = path.join(root, 'tools.local/bin/wasm-bindgen');
    command(
      hasFile(local) ? local : 'wasm-bindgen',
      ['--version'],
      'wasm-bindgen',
      new RegExp(`^wasm-bindgen ${requiredBindgen.replaceAll('.', '\\.')}`),
    );
  }
  if (mode === 'macos' || mode === 'all') {
    if (platform !== 'darwin' || arch !== 'arm64') problems.push('Native builds require Apple Silicon macOS (arm64).');
    command('xcodebuild', ['-version'], 'Xcode', /^Xcode /);
    command('xcrun', ['--find', 'swiftc'], 'Swift compiler');
    command('swift', ['--version'], 'Swift', /Swift version 6\./);
    command('xcrun', ['--find', 'codesign'], 'codesign');
  }
  if (!hasFile(path.join(root, 'node_modules')))
    problems.push('npm dependencies are missing. Run npm ci in this worktree.');
  return { problems, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, results } = inspect({ mode: process.argv[2] ?? 'all' });
  for (const line of results) console.log(line);
  if (problems.length) {
    for (const problem of problems) console.error(`FAIL: ${problem}`);
    process.exitCode = 1;
  } else console.log('Build prerequisites found.');
}
