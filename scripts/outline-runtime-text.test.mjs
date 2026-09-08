import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GlobalFonts } from '@napi-rs/canvas';
import { chromium } from '@playwright/test';
import { measureOutlineBaselines, outlineRuntimeText } from './outline-runtime-text.mjs';

const empty = () => ({ document: { global: { aspect: '1:1' }, layers: [] } });
test('rejects non-square derivatives explicitly', () => {
  const source = empty();
  source.document.global.aspect = '16:9';
  assert.throws(() => outlineRuntimeText(source), /square/);
});
test('does not mutate the original document or graph', () => {
  const source = empty();
  source.document.graph = { edges: [] };
  const before = JSON.stringify(source);
  const output = outlineRuntimeText(source);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(output.document.graph, source.document.graph);
  assert.notEqual(output.document, source.document);
});
test('missing fonts fail instead of silently outlining a fallback', () => {
  const source = empty();
  source.document.layers.push({ id: 'title', kind: 'text', font: 'Arial', content: 'Title' });
  assert.throws(() => outlineRuntimeText(source), /embedded font/);
});
test('corrupt embedded fonts fail', () => {
  const source = empty();
  source.document.layers.push({ id: 'title', kind: 'text', font: 'artifact-font://bad', content: 'Title' });
  source.document.fontAssets = [{ id: 'bad', dataUrl: 'data:font/ttf;base64,AAAA' }];
  assert.throws(() => outlineRuntimeText(source), /decode outline font/);
});
test('private conformance input becomes deterministic font-free vector layers', {
  skip: !process.env.ARTIFACT_OUTLINE_FIXTURE,
}, async () => {
  const source = JSON.parse(await readFile(process.env.ARTIFACT_OUTLINE_FIXTURE, 'utf8'));
  const before = JSON.stringify(source);
  const fontInventory = () =>
    GlobalFonts.families
      .map(({ family, styles }) =>
        JSON.stringify({ family, styles: styles.map((style) => JSON.stringify(style)).sort() }),
      )
      .sort();
  const families = fontInventory();
  const browser = await chromium.launch({ channel: process.env.ARTIFACT_BROWSER_CHANNEL ?? 'chrome' });
  try {
    const offsets = await measureOutlineBaselines(await browser.newPage(), source);
    const output = outlineRuntimeText(source, offsets);
    assert.deepEqual(outlineRuntimeText(source, offsets), output);
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(output.document.graph, source.document.graph);
    assert.deepEqual(
      output.document.layers.map((layer) => layer.id),
      source.document.layers.map((layer) => layer.id),
    );
    assert.equal(output.document.fontAssets, undefined);
    assert.deepEqual(output.manifest.fonts, []);
    assert.equal(output.manifest.fontEmbeddingMode, 'metadata-only');
    assert.equal(output.manifest.images.embeddedPayloads, source.manifest.images.embeddedPayloads + 4);
    for (let i = 0; i < source.document.layers.length; i++) {
      const original = source.document.layers[i];
      const layer = output.document.layers[i];
      if (original.kind !== 'text') assert.deepEqual(layer, original);
      else {
        assert.equal(layer.kind, 'image');
        assert.equal(layer.opacity, original.opacity);
        assert.equal(layer.blendMode, original.blendMode);
        const svg = Buffer.from(layer.src.split(',')[1], 'base64').toString();
        assert.match(svg, /<path\b/);
        assert.doesNotMatch(svg, /<text\b|font-family|@font-face|data:font/);
      }
    }
    assert.throws(() => outlineRuntimeText(source), /Missing browser baseline/);
    assert.deepEqual(fontInventory(), families, 'success and failure both release native font registrations');
  } finally {
    await browser.close();
  }
});
