import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2] ?? 'all';
const env = { ...process.env, MACOSX_DEPLOYMENT_TARGET: '14.0' };
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!['all', 'wasm', 'macos'].includes(mode)) throw new Error('Expected all, wasm, or macos');
if (mode !== 'macos') {
  run('cargo', ['build', '--locked', '-p', 'artifact-wasm', '--target', 'wasm32-unknown-unknown', '--release']);
  const local = path.join(root, 'tools.local/bin/wasm-bindgen');
  run(existsSync(local) ? local : 'wasm-bindgen', [
    'target/wasm32-unknown-unknown/release/artifact_wasm.wasm',
    '--target',
    'web',
    '--out-dir',
    'packages/artifact-core-web/generated',
  ]);
  run(process.execPath, ['scripts/core-pilot/runtime-manifest.mjs', '--write']);
}
if (mode !== 'wasm') {
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    throw new Error('Native pilot requires an Apple Silicon Mac');
  run('cargo', ['build', '--release', '--locked', '-p', 'artifact-ffi', '--features', 'bindgen']);
  run('cargo', [
    'run',
    '--release',
    '--locked',
    '-p',
    'artifact-ffi',
    '--features',
    'bindgen',
    '--bin',
    'artifact-bindgen',
    '--',
    'generate',
    '--library',
    'target/release/libartifact_ffi.dylib',
    '--language',
    'swift',
    '--out-dir',
    'apps/macos/Generated',
  ]);
  const build = path.join(root, 'apps/macos/.build');
  mkdirSync(build, { recursive: true });
  const common = [
    '-O',
    '-target',
    'arm64-apple-macosx14.0',
    '-I',
    'apps/macos/Generated',
    '-Xcc',
    '-fmodule-map-file=apps/macos/Generated/artifact_ffiFFI.modulemap',
    '-module-cache-path',
    path.join(build, 'module-cache'),
    'apps/macos/Generated/artifact_ffi.swift',
    'target/release/libartifact_ffi.a',
    '-framework',
    'Security',
    '-framework',
    'SystemConfiguration',
  ];
  run('xcrun', ['swiftc', ...common, 'apps/macos/Conformance.swift', '-o', path.join(build, 'conformance')]);
  run('xcrun', [
    'swiftc',
    ...common,
    'apps/macos/Sources/PilotRenderer.swift',
    'apps/macos/RenderCheck.swift',
    '-o',
    path.join(build, 'render-check'),
  ]);
  run('xcrun', [
    'swiftc',
    ...common,
    'apps/macos/Sources/PilotRenderer.swift',
    'apps/macos/Sources/ProjectModel.swift',
    'apps/macos/Sources/EditorState.swift',
    'apps/macos/Sources/ImageImport.swift',
    'apps/macos/ModelCheck.swift',
    '-o',
    path.join(build, 'model-check'),
  ]);
  run('xcrun', [
    'swiftc',
    ...common,
    'apps/macos/Sources/PilotRenderer.swift',
    'apps/macos/Sources/ImageImport.swift',
    'apps/macos/ImageCheck.swift',
    '-o',
    path.join(build, 'image-check'),
  ]);
  const app = path.join(build, 'Artifact.app/Contents');
  mkdirSync(path.join(app, 'MacOS'), { recursive: true });
  const sources = readdirSync(path.join(root, 'apps/macos/Sources'))
    .filter((f) => f.endsWith('.swift'))
    .map((f) => `apps/macos/Sources/${f}`);
  run('xcrun', ['swiftc', ...common, ...sources, '-o', path.join(app, 'MacOS/ArtifactCorePilot')]);
  writeFileSync(
    path.join(app, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ArtifactCorePilot</string>
<key>CFBundleIdentifier</key><string>dev.shchilkin.artifact.workspace</string>
<key>CFBundleName</key><string>Artifact</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>CFBundleDocumentTypes</key><array><dict><key>CFBundleTypeName</key><string>Artifact Project</string><key>CFBundleTypeRole</key><string>Editor</string><key>LSItemContentTypes</key><array><string>dev.shchilkin.artifact.project</string></array></dict></array>
<key>UTExportedTypeDeclarations</key><array><dict><key>UTTypeIdentifier</key><string>dev.shchilkin.artifact.project</string><key>UTTypeConformsTo</key><array><string>public.json</string></array><key>UTTypeTagSpecification</key><dict><key>public.filename-extension</key><array><string>artifact</string></array></dict></dict></array>
</dict></plist>\n`,
  );
  run('codesign', ['--force', '--sign', '-', path.dirname(app)]);
  console.log(`Built ${path.dirname(app)}`);
}
