import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const matrix = JSON.parse(read('docs/native-2d-capabilities.json'));
const cases = JSON.parse(read('tests/fixtures/native-2d/effect-cases.json'));
const webReference = JSON.parse(read('tests/fixtures/native-2d/web-reference.json'));
const config = read('apps/web/app/types/config.ts');
const presetUnion = config.split('export type EffectPreset =')[1].split('export interface EffectLayer')[0];
const webPresets = [...presetUnion.matchAll(/\| '([^']+)'/g)].map((match) => match[1]);

assert.equal(matrix.version, 1);
assert.equal(matrix.base, 'ca2a1e2b408998436414b2efde69777b65e249f5');
assert.equal(webPresets.length, 66, 'Web preset inventory changed; update this contract');
assert.equal(matrix.effects.length, 66);
assert.deepEqual(
  matrix.effects.map((entry) => entry.id.slice('effect.'.length)).sort(),
  [...webPresets].sort(),
  'Every Web effect must have exactly one owner',
);
assert.deepEqual(
  Object.fromEntries(
    [272, 273, 274, 275, 276].map((owner) => [owner, matrix.effects.filter((entry) => entry.owner === owner).length]),
  ),
  { 272: 18, 273: 21, 274: 10, 275: 10, 276: 7 },
);
assert.deepEqual(
  cases.cases.map((item) => item.preset).sort(),
  [...webPresets].sort(),
  'Every preset must have a relevant acceptance case',
);
for (const effect of matrix.effects) {
  const preset = effect.id.slice('effect.'.length);
  const testCase = cases.cases.find((item) => item.preset === preset);
  assert.equal(effect.owner, testCase.owner, preset);
  assert.equal(effect.fixture, `tests/fixtures/native-2d/effect-cases.json#${preset}`);
  assert.equal(effect.acceptance, 'planned', 'Cases are not yet parity evidence');
  assert.ok(statSync(resolve(root, testCase.documentTemplate)).isFile());
}

const unique = new Set();
const docCache = new Map();
for (const entry of [...matrix.effects, ...matrix.capabilities]) {
  assert.ok(!unique.has(entry.id), `duplicate capability: ${entry.id}`);
  unique.add(entry.id);
  assert.ok(Number.isInteger(entry.owner) && entry.owner >= 262 && entry.owner <= 278);
  assert.ok(['implemented', 'partial', 'missing'].includes(entry.native));
  assert.equal(entry.web, 'implemented');
  const [path, fragment] = entry.fixture.split('#');
  assert.ok(statSync(resolve(root, path)).isFile(), path);
  if (path.endsWith('.artifact.json')) {
    let doc = docCache.get(path);
    if (!doc) {
      doc = JSON.parse(read(path));
      docCache.set(path, doc);
    }
    assert.equal(doc.schemaVersion, 3);
    assert.ok(doc.layers.length > 0);
    assert.ok(doc.global.aspect);
    assert.ok(doc.export);
    assert.equal(fragment, undefined);
  }
}

const docs = Object.fromEntries([...docCache].map(([path, doc]) => [path.split('/').at(-1), doc]));
const fixture = (name) => docs[`${name}.artifact.json`];
assert.equal(
  fixture('text-font').layers.find((item) => item.id === 'font-title').font,
  'artifact-font://covered-grace-p01',
);
const fontAsset = fixture('text-font').fontAssets[0];
const fontBytes = Buffer.from(fontAsset.dataUrl.split(',')[1], 'base64');
assert.equal(fontAsset.bytes, fontBytes.length);
assert.equal(fontAsset.embeddingPolicy, 'open-license-embeddable');
assert.equal(fontBytes.toString('ascii', 0, 4), '\u0000\u0001\u0000\u0000');
assert.ok(fontBytes.equals(readFileSync(resolve(root, 'tests/fixtures/native-2d/CoveredByYourGrace.ttf'))));
assert.equal(fixture('alpha-nonsquare').global.aspect, '4:5');
const imageUrl = fixture('alpha-nonsquare').layers.find((item) => item.kind === 'image').src;
const imageBytes = Buffer.from(imageUrl.split(',')[1], 'base64');
assert.equal(imageBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(imageBytes.readUInt32BE(16), 96);
assert.equal(imageBytes.readUInt32BE(20), 64);
assert.equal(imageBytes[25], 6, 'PNG must be RGBA');
assert.equal(fixture('hundred-node').layers.length, 100);
assert.equal(fixture('hundred-node').graph.edges.length, 100);
const branching = fixture('branch-merge-mask-repeat').graph;
assert.deepEqual(
  branching.edges.filter((edge) => edge.toId === 'branch-merge').map((edge) => [edge.fromId, edge.toPort]),
  [
    ['branch-ground', 'a'],
    ['branch-mask', 'b'],
  ],
);
assert.ok(branching.edges.some((edge) => edge.toId === 'branch-mask' && edge.toPort === 'mask'));
assert.ok(branching.edges.some((edge) => edge.toId === 'branch-repeat'));
for (const kind of ['noise', 'array', 'lineField', 'emoji']) {
  assert.ok(
    fixture('source-families').layers.some((layer) => layer.kind === kind),
    kind,
  );
}
for (const kind of ['colorNodes', 'transformNodes', 'grimeShadowNodes']) {
  assert.equal(fixture('graph-utilities').graph[kind].length, 1);
}
for (const blend of ['normal', 'multiply', 'screen', 'overlay', 'luminosity']) {
  assert.ok(
    fixture('blend-modes').layers.some((layer) => layer.blendMode === blend),
    blend,
  );
}
assert.equal(fixture('alpha-jpeg').export.format, 'jpeg');
assert.deepEqual(
  new Set([...docCache.values()].map((doc) => doc.global.aspect)),
  new Set(['1:1', '4:5', '9:16', '16:9']),
);
assert.equal(webReference.productSourceRevision, matrix.base);
assert.equal(webReference.fixtureRevision, '66cb64f379a2af609f2a1a0a93f8d6ad408e65c3');
assert.equal(webReference.documents.length, 8);
assert.deepEqual(webReference.variants.map((item) => item.variant).sort(), ['mask-inverted', 'repeat-count-1']);
const baseSizes = { '1:1': [1000, 1000], '4:5': [1080, 1350], '9:16': [1080, 1920], '16:9': [1920, 1080] };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reportNames = new Set();
for (const observation of webReference.documents) {
  assert.ok(!reportNames.has(observation.fixture), `duplicate Web observation: ${observation.fixture}`);
  reportNames.add(observation.fixture);
  const doc = JSON.parse(read(observation.fixture));
  assert.equal(observation.fixtureFileSha256, hash(readFileSync(resolve(root, observation.fixture))));
  assert.equal(observation.imported.aspect, doc.global.aspect);
  assert.equal(observation.imported.layerCount, doc.layers.length);
  const [width, height] = baseSizes[doc.global.aspect];
  assert.equal(observation.exported.width, width * doc.export.scale);
  assert.equal(observation.exported.height, height * doc.export.scale);
  assert.equal(
    Object.values(observation.exported.alphaPixels).reduce((sum, count) => sum + count, 0),
    observation.exported.width * observation.exported.height,
  );
  assert.deepEqual(observation.pageErrors, []);
}
assert.deepEqual(
  reportNames,
  new Set([...docCache.keys()]),
  'Every editor fixture needs a pinned main-Web observation',
);
const observed = (name) => webReference.documents.find((item) => item.fixture.endsWith(`/${name}.artifact.json`));
assert.ok(observed('text-font').imported.embeddedFontFaces.some((face) => face.status === 'loaded'));
assert.deepEqual(observed('alpha-nonsquare').exported.samples.topLeft, [0, 0, 0, 0]);
assert.ok(observed('alpha-nonsquare').exported.alphaPixels.translucent > 0);
assert.deepEqual(observed('alpha-jpeg').exported.samples.topLeft, [0, 0, 0, 255]);
for (const variant of webReference.variants) {
  assert.equal(variant.fixture, observed('branch-merge-mask-repeat').fixture);
  assert.notEqual(variant.exported.decodedRgbaSha256, observed('branch-merge-mask-repeat').exported.decodedRgbaSha256);
  assert.deepEqual(variant.pageErrors, []);
}
console.log(
  `Native 2D P01 contract: ${matrix.effects.length} effects, ${matrix.capabilities.length} other capabilities, ${docCache.size} editor documents`,
);
