export function buildStages(mode, platform = process.platform, arch = process.arch) {
  if (!['all', 'wasm', 'macos'].includes(mode)) throw new Error('Expected all, wasm, or macos');
  const canonicalWasmHost = platform === 'linux' && arch === 'x64';
  const nativeHost = platform === 'darwin' && arch === 'arm64';
  if (mode === 'wasm' && !canonicalWasmHost)
    throw new Error(
      'Reviewed WASM is generated on Linux x86-64. Run npm run build:core-wasm-canonical (local Docker) on this host.',
    );
  if (mode === 'macos' && !nativeHost) throw new Error('Native builds require Apple Silicon macOS.');
  if (mode === 'all' && !canonicalWasmHost && !nativeHost)
    throw new Error('The default core build requires Linux x86-64 or Apple Silicon macOS.');
  return {
    wasm: mode === 'wasm' || (mode === 'all' && canonicalWasmHost),
    macos: mode === 'macos' || (mode === 'all' && nativeHost),
  };
}
