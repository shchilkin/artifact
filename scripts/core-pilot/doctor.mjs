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

export function inspect({
  mode = 'all',
  run = spawnSync,
  platform = process.platform,
  arch = process.arch,
  hasFile = existsSync,
} = {}) {
  if (!['all', 'web', 'macos'].includes(mode)) throw new Error('Expected all, web, or macos');
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
  const nodeVersion = command('node', ['--version'], 'Node.js', /^v\d+\.\d+\.\d+/);
  const match = nodeVersion.match(/^v(\d+)\.(\d+)\./);
  if (
    match &&
    (Number(match[1]) < 20 ||
      (Number(match[1]) === 20 && Number(match[2]) < 19) ||
      (Number(match[1]) === 22 && Number(match[2]) < 12))
  )
    problems.push('Node.js 20.19+ or 22.12+ is required by the current Web toolchain.');
  command('npm', ['--version'], 'npm', new RegExp(`^${requiredNpm}\\.`));
  command('cargo', ['--version'], 'Cargo', new RegExp(`^cargo ${requiredRust.replaceAll('.', '\\.')}`));
  command('rustc', ['--version'], 'Rust', new RegExp(`^rustc ${requiredRust.replaceAll('.', '\\.')}`));
  const installed = command('rustup', ['target', 'list', '--installed'], 'Rust targets');
  if (!installed.split('\n').includes('wasm32-unknown-unknown'))
    problems.push('Rust target wasm32-unknown-unknown is missing. Run rustup target add wasm32-unknown-unknown.');
  if (mode !== 'macos') {
    const local = path.join(root, 'tools.local/bin/wasm-bindgen');
    command(
      hasFile(local) ? local : 'wasm-bindgen',
      ['--version'],
      'wasm-bindgen',
      new RegExp(`^wasm-bindgen ${requiredBindgen.replaceAll('.', '\\.')}`),
    );
  }
  if (mode !== 'web') {
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
