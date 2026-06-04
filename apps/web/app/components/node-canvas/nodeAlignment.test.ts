import { describe, expect, it } from 'vitest';

import { snapNodeToAlignment } from './nodeAlignment';

describe('snapNodeToAlignment', () => {
  it('snaps a moving node center to a peer center within threshold', () => {
    const result = snapNodeToAlignment(
      { id: 'moving', position: { x: 192, y: 40 }, width: 100, height: 80 },
      [{ id: 'peer', position: { x: 170, y: 240 }, width: 160, height: 80 }],
      { threshold: 12 },
    );

    expect(result.position.x).toBe(200);
    expect(result.position.y).toBe(40);
    expect(result.guides).toEqual([{ orientation: 'vertical', position: 250, from: 40, to: 320 }]);
  });

  it('snaps horizontal and vertical edges independently', () => {
    const result = snapNodeToAlignment(
      { id: 'moving', position: { x: 54, y: 96 }, width: 100, height: 80 },
      [{ id: 'peer', position: { x: 50, y: 100 }, width: 120, height: 90 }],
      { threshold: 8 },
    );

    expect(result.position).toEqual({ x: 50, y: 100 });
    expect(result.guides).toEqual([
      { orientation: 'vertical', position: 50, from: 96, to: 190 },
      { orientation: 'horizontal', position: 100, from: 50, to: 170 },
    ]);
  });

  it('does not snap when anchors are outside threshold', () => {
    const result = snapNodeToAlignment(
      { id: 'moving', position: { x: 130, y: 140 }, width: 100, height: 80 },
      [{ id: 'peer', position: { x: 200, y: 240 }, width: 100, height: 80 }],
      { threshold: 8 },
    );

    expect(result.position).toEqual({ x: 130, y: 140 });
    expect(result.guides).toEqual([]);
  });
});
