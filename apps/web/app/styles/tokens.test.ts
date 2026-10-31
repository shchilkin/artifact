import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function oklchToken(name: string) {
  const match = tokens.match(new RegExp(`${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  if (!match) throw new Error(`${name} is not a plain oklch() token`);
  return { lightness: Number(match[1]), hue: Number(match[3]) };
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

const EDITOR_CSS = [
  ...cssFiles(join(APP_DIR, 'components')),
  ...cssFiles(join(APP_DIR, 'routes/editor')),
  join(APP_DIR, 'index.css'),
];

function findMatches(pattern: RegExp): string[] {
  return EDITOR_CSS.flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        pattern.test(line) ? [`${relative(APP_DIR, path)}:${index + 1}: ${line.trim()}`] : [],
      ),
  );
}

describe('color tokens', () => {
  it('keeps danger distinct from the flare accent by at least 10° hue or 6 L', () => {
    const danger = oklchToken('--state-danger');
    const accent = oklchToken('--token-flare');
    const hueDelta = Math.min(Math.abs(danger.hue - accent.hue), 360 - Math.abs(danger.hue - accent.hue));
    const lightnessDelta = Math.abs(danger.lightness - accent.lightness);
    expect(hueDelta >= 10 || lightnessDelta >= 6).toBe(true);
  });

  it('resolves Tailwind theme colours to the semantic tokens', () => {
    const index = readFileSync(join(APP_DIR, 'index.css'), 'utf8');
    const theme = index.match(/@theme\s*\{([^}]*)\}/)?.[1] ?? '';
    const colours = [...theme.matchAll(/(--color-[a-z-]+):\s*([^;]+);/g)];
    expect(colours.length).toBeGreaterThan(0);
    for (const [, name, value] of colours) {
      expect(value, name).toMatch(/^var\(--[a-z-]+\)$/);
    }
  });
});

describe('editor type and layering tokens', () => {
  it('sets font sizes through type tokens', () => {
    expect(findMatches(/font-size:[^;]*\d(px|rem|em)/)).toEqual([]);
  });

  it('keeps every type token at or above the 10 px floor', () => {
    const sizes = [...tokens.matchAll(/(--(?:type|control-font-size)-[a-z-]+):\s*(\d+)px/g)];
    expect(sizes.length).toBeGreaterThan(0);
    for (const [, name, px] of sizes) {
      expect(Number(px), name).toBeGreaterThanOrEqual(10);
    }
  });

  it('keeps raw z-index values at 100 or below', () => {
    expect(findMatches(/z-index:\s*\d{3,}/).filter((match) => !/z-index:\s*100\b/.test(match))).toEqual([]);
  });
});
