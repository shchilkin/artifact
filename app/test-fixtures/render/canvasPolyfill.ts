/**
 * Canvas polyfill for the Node.js test environment.
 *
 * `renderer.ts` calls `document.createElement('canvas')` to create off-screen
 * drawing surfaces. In Node.js there is no DOM, so we register a minimal stub
 * backed by @napi-rs/canvas — a prebuilt native binding that provides a full
 * Canvas 2D implementation without requiring Cairo to be installed separately.
 *
 * Import this file via vitest `setupFiles` so it runs before any test module.
 */

import { createCanvas } from '@napi-rs/canvas';

const mockDocument = {
  createElement(tag: string): HTMLCanvasElement {
    if (tag === 'canvas') {
      // @napi-rs/canvas supports width/height setters and all Canvas 2D APIs
      // needed by renderer.ts (fillRect, fillText, measureText, getImageData, etc.)
      return createCanvas(300, 150) as unknown as HTMLCanvasElement;
    }
    throw new Error(`document.createElement('${tag}') is not supported in Node test env`);
  },
};

// Only register if running in Node (not jsdom/happy-dom which have their own document)
if (typeof globalThis.document === 'undefined') {
  (globalThis as Record<string, unknown>).document = mockDocument;
}
