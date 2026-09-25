import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentity } from './build-identity.mjs';
import { buildStages } from './build-plan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2] ?? 'all';
const stages = buildStages(mode);
const env = { ...process.env, MACOSX_DEPLOYMENT_TARGET: '14.0' };
function run(command, args, runEnv = env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: runEnv,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!stages.wasm) run(process.execPath, ['scripts/core-pilot/runtime-manifest.mjs']);
if (stages.wasm) {
  const cargoHome = path.resolve(process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo'));
  const wasmEnv = {
    ...env,
    // Panic locations otherwise contain host-specific Cargo registry paths.
    CARGO_ENCODED_RUSTFLAGS: [`--remap-path-prefix=${root}=/workspace`, `--remap-path-prefix=${cargoHome}=/cargo`].join(
      '\x1f',
    ),
  };
  delete wasmEnv.RUSTFLAGS;
  run(
    'cargo',
    ['build', '--locked', '-p', 'artifact-wasm', '--target', 'wasm32-unknown-unknown', '--release'],
    wasmEnv,
  );
  const local = path.join(root, 'tools.local/bin/wasm-bindgen');
  run(existsSync(local) ? local : 'wasm-bindgen', [
    'target/wasm32-unknown-unknown/release/artifact_wasm.wasm',
    '--target',
    'web',
    '--out-dir',
    'packages/artifact-core-web/generated',
  ]);
  const wasm = readFileSync(path.join(root, 'packages/artifact-core-web/generated/artifact_wasm_bg.wasm'));
  for (const hostPath of [root, cargoHome]) {
    if (wasm.includes(Buffer.from(hostPath)))
      throw new Error(`Generated WASM embeds host path ${hostPath}. Check Rust path remapping.`);
  }
  run(process.execPath, ['scripts/core-pilot/runtime-manifest.mjs', '--write']);
}
if (stages.macos) {
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
  const rendererSources = [
    'apps/macos/Sources/NativeRenderPlan.swift',
    'apps/macos/Sources/NativeRenderResources.swift',
    'apps/macos/Sources/NativeRasterTarget.swift',
    'apps/macos/Sources/NativeFillModule.swift',
    'apps/macos/Sources/NativePilotEffectModule.swift',
    'apps/macos/Sources/NativeRenderRegistry.swift',
    'apps/macos/Sources/NativeGraphUtilities.swift',
    'apps/macos/Sources/NativeGraphExecutor.swift',
    'apps/macos/Sources/NativeExportService.swift',
    'apps/macos/Sources/LayerGeometry.swift',
    'apps/macos/Sources/PilotRenderer.swift',
  ];
  run('xcrun', ['swiftc', ...common, 'apps/macos/Conformance.swift', '-o', path.join(build, 'conformance')]);
  run('xcrun', [
    'swiftc',
    ...common,
    ...rendererSources,
    'apps/macos/RenderCheck.swift',
    '-o',
    path.join(build, 'render-check'),
  ]);
  run('xcrun', [
    'swiftc',
    ...common,
    ...rendererSources,
    'apps/macos/GraphRenderCheck.swift',
    '-o',
    path.join(build, 'graph-render-check'),
  ]);
  run('xcrun', [
    'swiftc',
    ...common,
    ...rendererSources,
    'apps/macos/Sources/ProjectFileService.swift',
    'apps/macos/Sources/NativeCommandService.swift',
    'apps/macos/Sources/FontImport.swift',
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
    ...rendererSources,
    'apps/macos/Sources/ProjectFileService.swift',
    'apps/macos/Sources/NativeCommandService.swift',
    'apps/macos/Sources/FontImport.swift',
    'apps/macos/Sources/ProjectModel.swift',
    'apps/macos/Sources/EditorState.swift',
    'apps/macos/Sources/ImageImport.swift',
    'apps/macos/PreviewResponseCheck.swift',
    '-o',
    path.join(build, 'preview-response-check'),
  ]);
  run('xcrun', [
    'swiftc',
    ...common,
    ...rendererSources,
    'apps/macos/Sources/ProjectFileService.swift',
    'apps/macos/Sources/NativeCommandService.swift',
    'apps/macos/Sources/FontImport.swift',
    'apps/macos/Sources/ProjectModel.swift',
    'apps/macos/Sources/EditorState.swift',
    'apps/macos/Sources/ArtworkTransform.swift',
    'apps/macos/Sources/ImageImport.swift',
    'apps/macos/LayerInteractionCheck.swift',
    '-o',
    path.join(build, 'layer-interaction-check'),
  ]);
  run('xcrun', [
    'swiftc',
    ...common,
    ...rendererSources,
    'apps/macos/Sources/ImageImport.swift',
    'apps/macos/ImageCheck.swift',
    '-o',
    path.join(build, 'image-check'),
  ]);
  run('xcrun', [
    'swiftc',
    ...common,
    ...rendererSources,
    'apps/macos/Sources/ProjectFileService.swift',
    'apps/macos/Sources/NativeCommandService.swift',
    'apps/macos/Sources/FontImport.swift',
    'apps/macos/FileExportCheck.swift',
    '-o',
    path.join(build, 'file-export-check'),
  ]);
  const app = path.join(build, 'Artifact.app/Contents');
  rmSync(path.dirname(app), { recursive: true, force: true });
  mkdirSync(path.join(app, 'MacOS'), { recursive: true });
  mkdirSync(path.join(app, 'Resources'), { recursive: true });
  const sources = readdirSync(path.join(root, 'apps/macos/Sources'))
    .filter((f) => f.endsWith('.swift'))
    .map((f) => `apps/macos/Sources/${f}`);
  run('xcrun', ['swiftc', ...common, ...sources, '-o', path.join(app, 'MacOS/ArtifactCorePilot')]);
  const identity = buildIdentity();
  writeFileSync(path.join(app, 'Resources/build-identity.json'), `${JSON.stringify(identity, null, 2)}\n`);
  writeFileSync(
    path.join(app, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ArtifactCorePilot</string>
<key>CFBundleIdentifier</key><string>dev.shchilkin.artifact.workspace</string>
<key>CFBundleName</key><string>Artifact</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${identity.version}</string>
<key>CFBundleVersion</key><string>${identity.buildNumber}</string>
<key>ArtifactBuildSHA</key><string>${identity.sha}</string>
<key>ArtifactBuildDirty</key><${identity.dirty ? 'true' : 'false'}/>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>CFBundleDocumentTypes</key><array><dict><key>CFBundleTypeName</key><string>Artifact Project</string><key>CFBundleTypeRole</key><string>Editor</string><key>LSItemContentTypes</key><array><string>dev.shchilkin.artifact.project</string></array></dict></array>
<key>UTExportedTypeDeclarations</key><array><dict><key>UTTypeIdentifier</key><string>dev.shchilkin.artifact.project</string><key>UTTypeConformsTo</key><array><string>public.json</string></array><key>UTTypeTagSpecification</key><dict><key>public.filename-extension</key><array><string>artifact</string></array></dict></dict></array>
</dict></plist>\n`,
  );
  run('codesign', ['--force', '--sign', '-', path.dirname(app)]);
  console.log(
    `Built ${path.dirname(app)} version ${identity.version} sha ${identity.sha}${identity.dirty ? ' (dirty)' : ''}`,
  );
}
