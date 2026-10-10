import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function oklchToken(name: string) {
  const match = tokens.match(new RegExp(`${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  if (!match) throw new Error(`${name} is not a plain oklch() token`);
  return { lightness: Number(match[1]), hue: Number(match[3]) };
}

describe('color tokens', () => {
  it('keeps danger distinct from the flare accent by at least 10° hue or 6 L', () => {
    const danger = oklchToken('--state-danger');
    const accent = oklchToken('--token-flare');
    const hueDelta = Math.min(Math.abs(danger.hue - accent.hue), 360 - Math.abs(danger.hue - accent.hue));
    const lightnessDelta = Math.abs(danger.lightness - accent.lightness);
    expect(hueDelta >= 10 || lightnessDelta >= 6).toBe(true);
  });
});
