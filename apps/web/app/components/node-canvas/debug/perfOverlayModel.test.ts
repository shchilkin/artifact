import { describe, expect, it } from 'vitest';
import { PERF_OVERLAY_DEFAULT_POSITION, parsePerfOverlayPosition } from './perfOverlayModel';

describe('perfOverlayModel', () => {
  it('parses a persisted overlay position', () => {
    expect(parsePerfOverlayPosition(JSON.stringify({ x: 42, y: 84 }))).toEqual({ x: 42, y: 84 });
  });

  it('uses the default position for empty or invalid shapes', () => {
    expect(parsePerfOverlayPosition(null)).toEqual(PERF_OVERLAY_DEFAULT_POSITION);
    expect(parsePerfOverlayPosition(JSON.stringify({ x: '42', y: 84 }))).toEqual(PERF_OVERLAY_DEFAULT_POSITION);
  });
});
