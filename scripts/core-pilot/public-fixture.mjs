import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = path.join(root, 'tests/fixtures/native-2d/text-font.artifact.json');
const outputPath = path.join(root, 'test-results/core-pilot/public-p01.artifact');
const source = readFileSync(sourcePath);
const document = JSON.parse(source.toString());
document.layers.push({
  id: 'p02-scanlines',
  name: 'P02 scanlines',
  kind: 'effect',
  visible: true,
  scanlines: 38,
  scanlineWidth: 4,
  opacity: 100,
});
const project = {
  artifactPackage: 'project',
  manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
  document,
};
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(project)}\n`);
console.log(`Public P01 fixture derivative: ${outputPath}`);
console.log(`Source SHA-256: ${createHash('sha256').update(source).digest('hex')}`);
