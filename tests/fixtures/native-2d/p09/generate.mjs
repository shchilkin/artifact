import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const parent = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(readFileSync(path.join(parent, `${name}.artifact.json`), 'utf8'));
const output = import.meta.dirname;
const generated = [];
mkdirSync(output, { recursive: true });
function save(name, document) {
  const destination = path.join(output, `${name}.artifact.json`);
  writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`);
  generated.push(destination);
}
function target(document, id) {
  const copy = structuredClone(document);
  const edge = copy.graph.edges.find((item) => item.toId === '__export__' && item.toPort === 'in');
  edge.fromId = id;
  edge.id = `p09-${id}-export`;
  return copy;
}

const utility = read('graph-utilities');
for (const [name, id] of [
  ['color', 'utility-color'],
  ['transform', 'utility-transform'],
  ['grime-shadow', 'utility-shadow'],
])
  save(name, target(utility, id));
const nonSquare = target(utility, 'utility-transform');
nonSquare.global.aspect = '16:9';
save('transform-nonsquare', nonSquare);
const clipping = target(utility, 'utility-color');
clipping.layers[0].opacity = 50;
Object.assign(clipping.graph.colorNodes[0], { brightness: 200, contrast: 150, saturation: 160, hue: 45 });
save('color-translucent-clipping', clipping);

const branch = read('branch-merge-mask-repeat');
for (const [name, id] of [
  ['repeat', 'branch-repeat'],
  ['mask', 'branch-mask'],
  ['merge', 'branch-merge'],
])
  save(name, target(branch, id));
save('combined', branch);
const shared = structuredClone(branch);
const sharedBase = shared.graph.edges.find((item) => item.toId === 'branch-merge' && item.toPort === 'a');
sharedBase.fromId = 'branch-art';
sharedBase.id = 'p09-shared-art-merge-a';
save('shared-upstream', shared);
const noMask = target(branch, 'branch-mask');
noMask.graph.edges = noMask.graph.edges.filter((item) => !(item.toId === 'branch-mask' && item.toPort === 'mask'));
save('mask-no-mask-input', noMask);
const feathered = target(branch, 'branch-mask');
Object.assign(feathered.graph.maskNodes[0], { expand: 8, feather: 6, opacity: 70 });
save('mask-expanded-feathered', feathered);
const noOverlay = target(branch, 'branch-merge');
noOverlay.graph.edges = noOverlay.graph.edges.filter((item) => !(item.toId === 'branch-merge' && item.toPort === 'b'));
save('merge-no-b-input', noOverlay);
const empty = target(branch, 'branch-merge');
empty.graph.edges = empty.graph.edges.filter((item) => item.toId !== 'branch-merge');
save('merge-empty', empty);
const transparentExport = structuredClone(branch);
transparentExport.graph.edges = transparentExport.graph.edges.filter((item) => item.toId !== '__export__');
transparentExport.global.bg = '#cc1144';
save('export-empty-transparent', transparentExport);
const reordered = read('blend-modes');
reordered.layers.reverse();
save('stack-reordered', reordered);
const biome = path.resolve(output, '../../../../node_modules/.bin/biome');
const formatted = spawnSync(biome, ['format', '--write', ...generated], { encoding: 'utf8' });
if (formatted.status !== 0) throw new Error(formatted.stderr || formatted.stdout);
