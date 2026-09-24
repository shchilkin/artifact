import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scratch = path.join(root, 'tools.local/wasm-linux-x64');
const generated = path.join(root, 'packages/artifact-core-web/generated');
const lock = readFileSync(path.join(root, 'Cargo.lock'), 'utf8');
const toolchain = readFileSync(path.join(root, 'rust-toolchain.toml'), 'utf8');
const bindgen = lock.match(/name = "wasm-bindgen"\nversion = "([0-9.]+)"/)?.[1];
const rust = toolchain.match(/channel\s*=\s*"([0-9.]+)"/)?.[1];
if (!bindgen || !rust) throw new Error('Rust or wasm-bindgen version is missing from the reviewed pins');
if (!existsSync(scratch)) mkdirSync(scratch, { recursive: true });

// The x86-64 Rust compiler is the canonical producer of checked-in WASM. Cargo
// embeds host-dependent crate metadata even when source paths are remapped.
const script = `
set -eu
rustup toolchain install ${rust} --profile minimal --target wasm32-unknown-unknown
export CARGO_HOME=/scratch/cargo
export PATH="/scratch/rustup/toolchains/${rust}-x86_64-unknown-linux-gnu/bin:$PATH"
if [ "$(/scratch/bindgen/bin/wasm-bindgen --version 2>/dev/null || true)" != "wasm-bindgen ${bindgen}" ]; then
  cargo install wasm-bindgen-cli --version ${bindgen} --locked --root /scratch/bindgen
fi
export RUSTFLAGS='--remap-path-prefix=/workspace=/workspace --remap-path-prefix=/scratch/cargo=/cargo'
cargo build --locked -p artifact-wasm --target wasm32-unknown-unknown --release
mkdir -p /scratch/generated
/scratch/bindgen/bin/wasm-bindgen /scratch/target/wasm32-unknown-unknown/release/artifact_wasm.wasm --target web --out-dir /scratch/generated
`;
const image = 'rust:1.95-slim@sha256:e14e87345b4d5964ddcc3491d27ee046a0f23820f340c3c1e24da6880141f7c0';
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--platform',
    'linux/amd64',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '-v',
    `${root}:/workspace:ro`,
    '-v',
    `${scratch}:/scratch`,
    '-w',
    '/workspace',
    '-e',
    'HOME=/scratch',
    '-e',
    'RUSTUP_HOME=/scratch/rustup',
    '-e',
    'CARGO_TARGET_DIR=/scratch/target',
    image,
    'sh',
    '-ec',
    script,
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw new Error(`Docker is required for canonical WASM generation: ${result.error.message}`);
if (result.status !== 0) process.exit(result.status ?? 1);

for (const name of ['artifact_wasm.js', 'artifact_wasm.d.ts', 'artifact_wasm_bg.wasm', 'artifact_wasm_bg.wasm.d.ts']) {
  const source = path.join(scratch, 'generated', name);
  if (!existsSync(source)) throw new Error(`Canonical WASM build did not produce ${name}`);
  copyFileSync(source, path.join(generated, name));
}
const wasm = readFileSync(path.join(generated, 'artifact_wasm_bg.wasm'));
for (const hostPath of [root, scratch, '/scratch/'])
  if (wasm.includes(Buffer.from(hostPath))) throw new Error(`Generated WASM embeds host path ${hostPath}`);
const manifest = spawnSync(process.execPath, ['scripts/core-pilot/runtime-manifest.mjs', '--write'], {
  cwd: root,
  stdio: 'inherit',
});
if (manifest.error) throw manifest.error;
if (manifest.status !== 0) process.exit(manifest.status ?? 1);
console.log('Canonical Linux x86-64 WASM runtime regenerated');
