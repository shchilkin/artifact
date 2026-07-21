import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const repositoryRoot = resolve(import.meta.dirname, '..');
const outputDirectory = process.env.ARTIFACT_PACK_OUTPUT ?? '/private/tmp/artifact-runtime-pack';
await mkdir(outputDirectory, { recursive: true });

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const packResult = JSON.parse(
  run('npm', ['pack', '--workspace', '@shchilkin/artifact-runtime', '--json', '--pack-destination', outputDirectory]),
);
const packed = packResult[0];
if (!packed?.filename) throw new Error('npm pack did not report an output filename.');
const tarballPath = join(outputDirectory, packed.filename);
const tarballBytes = await readFile(tarballPath);
const consumerRoot = await mkdtemp(join(tmpdir(), 'artifact-runtime-consumer-'));

try {
  const extractedRoot = join(consumerRoot, 'extracted');
  const packageRoot = join(extractedRoot, 'package');
  const packageLink = join(consumerRoot, 'node_modules', '@shchilkin', 'artifact-runtime');
  const pixiLink = join(consumerRoot, 'node_modules', 'pixi.js');
  await mkdir(extractedRoot, { recursive: true });
  run('tar', ['-xzf', tarballPath, '-C', extractedRoot]);
  await mkdir(dirname(packageLink), { recursive: true });
  await symlink(packageRoot, packageLink, 'dir');
  await symlink(join(repositoryRoot, 'node_modules', 'pixi.js'), pixiLink, 'dir');
  await writeFile(join(consumerRoot, 'package.json'), '{"type":"module","private":true}\n');
  await writeFile(
    join(consumerRoot, 'consumer.mjs'),
    `import {
      analyzeArtifactRuntimeProject,
      analyzeMixedMediaMotionRecipe,
      createArtifactRuntimePlayer,
      createMixedMediaArtwork,
      evaluateMixedMediaMotion,
    } from '@shchilkin/artifact-runtime';

    const project = {
      artifactPackage: 'project',
      manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
      document: { schemaVersion: 3, global: { seed: 1, aspect: '1:1' }, layers: [{ id: 'fill', kind: 'fill' }] },
    };
    const recipe = {
      kind: 'artifact-motion-recipe',
      schemaVersion: 1,
      profile: 'mixed-media-2d@1',
      compositionSha256: '${'a'.repeat(64)}',
      timeline: { durationSeconds: 2, mode: 'loop' },
      tracks: [],
    };
    const capability = analyzeArtifactRuntimeProject(project);
    const compatibility = analyzeMixedMediaMotionRecipe(project, recipe);
    const evaluated = evaluateMixedMediaMotion(recipe, 1);
    if (!capability.supported || !compatibility.compatible || evaluated.size !== 0) process.exit(2);
    if (typeof createArtifactRuntimePlayer !== 'function' || typeof createMixedMediaArtwork !== 'function') process.exit(3);
    console.log(JSON.stringify({
      capability: capability.status,
      compatibility: compatibility.compatible,
      legacyRasterPrototype: typeof createArtifactRuntimePlayer,
      mixedMediaFactory: typeof createMixedMediaArtwork,
    }));
    `,
  );
  const consumer = JSON.parse(run(process.execPath, ['consumer.mjs'], consumerRoot));
  console.log(
    JSON.stringify(
      {
        consumer,
        filename: packed.filename,
        packageSizeBytes: tarballBytes.byteLength,
        packageVersion: packed.version,
        sha256: createHash('sha256').update(tarballBytes).digest('hex'),
        tarballPath,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(consumerRoot, { recursive: true, force: true });
}
