// Rebuild only the synthetic P01 documents. No private artwork or local assets.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const font = readFileSync(join(here, 'CoveredByYourGrace.ttf'));
const fontUrl = `data:font/ttf;base64,${font.toString('base64')}`;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(kind, body) {
  const label = Buffer.from(kind);
  const size = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([label, body])));
  return Buffer.concat([size, label, body, checksum]);
}

function pngDataUrl(width, height) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * (1 + width * 4) + 1 + x * 4;
      const inside = x >= 12 && x < width - 12 && y >= 9 && y < height - 9;
      raw[i] = inside ? 30 : 240;
      raw[i + 1] = inside ? 180 : 40;
      raw[i + 2] = inside ? 220 : 70;
      raw[i + 3] = inside ? 220 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const bytes = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

const imageUrl = pngDataUrl(96, 64);
const base = (aspect, seed = 321) => ({
  schemaVersion: 3,
  global: { bg: 'transparent', seed, aspect },
  layers: [],
  export: { format: 'png', scale: 1, target: 'cover' },
});
const fill = (id, color, opacity = 100, blendMode = 'normal') => ({
  id,
  name: id,
  visible: true,
  locked: false,
  kind: 'fill',
  color,
  opacity,
  blendMode,
});
const image = (id, x = 0.5, y = 0.5) => ({
  id,
  name: id,
  visible: true,
  locked: false,
  kind: 'image',
  src: imageUrl,
  fit: 'contain',
  x,
  y,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 100,
  blendMode: 'normal',
});
const edge = (fromId, toId, toPort) => ({
  id: `edge-${fromId}-${toId}-${toPort}`,
  fromId,
  fromPort: 'out',
  toId,
  toPort,
});
const graph = (edges, positions, extra = {}) => ({
  edges,
  positions,
  mergeNodes: [],
  colorNodes: [],
  repeatNodes: [],
  maskNodes: [],
  transformNodes: [],
  grimeShadowNodes: [],
  areas: [],
  ...extra,
});

const textFont = base('1:1', 101);
textFont.layers = [
  fill('font-plate', '#17253a'),
  {
    id: 'font-title',
    name: 'Editable title',
    visible: true,
    locked: false,
    kind: 'text',
    content: 'ARTIFACT 2D',
    font: 'artifact-font://covered-grace-p01',
    size: 96,
    color: '#f7ecd9',
    opacity: 100,
    blendMode: 'normal',
    x: 0.5,
    y: 0.44,
    rotation: -4,
    align: 'center',
    scaleX: 1,
    scaleY: 1,
  },
];
textFont.fontAssets = [
  {
    id: 'covered-grace-p01',
    dataUrl: fontUrl,
    mime: 'font/ttf',
    bytes: font.length,
    label: 'Covered By Your Grace',
    family: 'Artifact Imported covered grace p01',
    createdAt: '2026-09-24T00:00:00.000Z',
    source: 'google-fonts',
    sourceName: 'CoveredByYourGrace.ttf',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/coveredbyyourgrace',
    license: { name: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org/', allowsEmbedding: true },
    embeddingPolicy: 'open-license-embeddable',
  },
];

const alpha = base('4:5', 202);
alpha.layers = [image('alpha-image', 0.44, 0.52)];
const jpeg = structuredClone(alpha);
jpeg.export = { format: 'jpeg', scale: 2, target: 'cover' };
const blends = base('1:1', 707);
blends.layers = [
  fill('blend-base', '#285c91'),
  fill('blend-multiply', '#ffb347', 55, 'multiply'),
  fill('blend-screen', '#4984e8', 45, 'screen'),
  fill('blend-overlay', '#e8508d', 35, 'overlay'),
  fill('blend-luminosity', '#b9d63e', 30, 'luminosity'),
];

const branch = base('16:9', 303);
branch.layers = [fill('branch-ground', '#16273d'), image('branch-art', 0.46, 0.5), image('branch-matte', 0.58, 0.5)];
branch.graph = graph(
  [
    edge('branch-art', 'branch-repeat', 'in'),
    edge('branch-repeat', 'branch-mask', 'in'),
    edge('branch-matte', 'branch-mask', 'mask'),
    edge('branch-ground', 'branch-merge', 'a'),
    edge('branch-mask', 'branch-merge', 'b'),
    edge('branch-merge', '__export__', 'in'),
  ],
  {
    'branch-ground': { x: 0, y: 520 },
    'branch-art': { x: 0, y: 80 },
    'branch-matte': { x: 520, y: 520 },
    'branch-repeat': { x: 520, y: 80 },
    'branch-mask': { x: 1040, y: 80 },
    'branch-merge': { x: 1560, y: 80 },
    __export__: { x: 2080, y: 80 },
  },
  {
    mergeNodes: [{ id: 'branch-merge', name: 'Merge', blendMode: 'source-over', opacity: 100 }],
    repeatNodes: [
      {
        id: 'branch-repeat',
        name: 'Repeat',
        pattern: 'grid',
        count: 3,
        rows: 2,
        gap: 100,
        radius: 90,
        scale: 28,
        jitter: 0,
        rotation: 0,
        seedOffset: 0,
        opacity: 100,
        blendMode: 'normal',
      },
    ],
    maskNodes: [
      {
        id: 'branch-mask',
        name: 'Mask',
        mode: 'alpha',
        invert: false,
        threshold: 50,
        feather: 0,
        expand: 0,
        opacity: 100,
      },
    ],
    areas: [
      {
        id: 'branch-area',
        name: 'Composite',
        nodeIds: ['branch-repeat', 'branch-mask', 'branch-merge'],
        color: '#79e3c5',
      },
    ],
  },
);

const sourceFamilies = base('4:5', 505);
const procedural = (id, kind, color, overrides) => ({
  id,
  name: id,
  visible: true,
  locked: false,
  kind,
  color,
  accentColor: '#9d5cff',
  opacity: 100,
  blendMode: 'normal',
  seedOffset: 0,
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  ...overrides,
});
sourceFamilies.layers = [
  procedural('source-noise', 'noise', '#2cc9e8', {
    noiseType: 'cells',
    noiseScale: 28,
    noiseDetail: 4,
    noiseContrast: 52,
    noiseBalance: 50,
    noiseWarp: 10,
    noiseTurbulence: 12,
    noiseThreshold: 20,
  }),
  procedural('source-array', 'array', '#ff6844', {
    arrayPattern: 'radial',
    arrayShape: 'disc',
    arrayCount: 8,
    arrayRows: 2,
    arrayGap: 30,
    arrayRadius: 120,
    arraySize: 36,
    arrayJitter: 0,
  }),
  procedural('source-lines', 'lineField', '#e8d847', {
    lineFieldOrientation: 'diagonal',
    lineFieldDistortion: 'wave',
    lineFieldCount: 28,
    lineFieldSpacing: 18,
    lineFieldStroke: 3,
    lineFieldStrength: 16,
    lineFieldFrequency: 3,
    lineFieldBackground: '#000000',
    lineFieldTransparent: true,
  }),
  {
    id: 'source-emoji',
    name: 'Emoji',
    visible: true,
    locked: false,
    kind: 'emoji',
    emojis: ['✦', '☼'],
    density: 8,
    minSz: 30,
    maxSz: 60,
    blur: 0,
    seedOffset: 0,
    opacity: 100,
    blendMode: 'normal',
  },
];

const utilities = base('1:1', 606);
utilities.layers = [image('utility-art')];
utilities.graph = graph(
  [
    edge('utility-art', 'utility-color', 'in'),
    edge('utility-color', 'utility-transform', 'in'),
    edge('utility-transform', 'utility-shadow', 'in'),
    edge('utility-shadow', '__export__', 'in'),
  ],
  {
    'utility-art': { x: 0, y: 80 },
    'utility-color': { x: 520, y: 80 },
    'utility-transform': { x: 1040, y: 80 },
    'utility-shadow': { x: 1560, y: 80 },
    __export__: { x: 2080, y: 80 },
  },
  {
    colorNodes: [{ id: 'utility-color', name: 'Color', contrast: 108, brightness: 100, saturation: 120, hue: 15 }],
    transformNodes: [
      {
        id: 'utility-transform',
        name: 'Transform',
        x: 12,
        y: -8,
        scaleX: 110,
        scaleY: 110,
        uniformScale: true,
        rotation: 12,
        pivotMode: 'visible',
        opacity: 100,
      },
    ],
    grimeShadowNodes: [
      {
        id: 'utility-shadow',
        name: 'Grime Shadow',
        x: 10,
        y: 12,
        layers: 3,
        blur: 6,
        spread: 5,
        grime: 20,
        jitter: 3,
        opacity: 70,
        color: '#101020',
        seedOffset: 0,
        shadowOnly: false,
      },
    ],
  },
);

const hundred = base('9:16', 404);
hundred.layers = Array.from({ length: 100 }, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  const v = (((i * 47) % 160) + 48).toString(16).padStart(2, '0');
  return fill(`stress-${n}`, `#${v}3355`, i === 0 ? 100 : 6);
});
hundred.graph = graph(
  hundred.layers.map((layer, i) =>
    edge(layer.id, hundred.layers[i + 1]?.id ?? '__export__', hundred.layers[i + 1] ? 'bg' : 'in'),
  ),
  Object.fromEntries([
    ...hundred.layers.map((layer, i) => [layer.id, { x: (i % 10) * 440, y: Math.floor(i / 10) * 430 }]),
    ['__export__', { x: 4400, y: 0 }],
  ]),
);

textFont.export.scale = 3;
for (const [name, doc] of Object.entries({
  'text-font': textFont,
  'alpha-nonsquare': alpha,
  'alpha-jpeg': jpeg,
  'blend-modes': blends,
  'branch-merge-mask-repeat': branch,
  'source-families': sourceFamilies,
  'graph-utilities': utilities,
  'hundred-node': hundred,
})) {
  writeFileSync(join(here, `${name}.artifact.json`), `${JSON.stringify(doc, null, 2)}\n`);
}
