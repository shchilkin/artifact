import { describe, expect, it } from 'vitest';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../src/contracts.js';
import { generateCustomShaderSpecFromPrompt, validateShaderPrompt } from '../src/customShaderSpecGenerator.js';

describe('custom shader spec generator', () => {
  it('maps prompts to deterministic editable shader specs', () => {
    const prompt = 'neon spiral halftone waves';
    const first = generateCustomShaderSpecFromPrompt(prompt);
    const second = generateCustomShaderSpecFromPrompt(prompt);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: 2,
      label: 'AI Halftone',
      prompt,
    });
    expect(first.operations.map((operation) => operation.op)).toEqual(
      expect.arrayContaining(['noise', 'wave', 'swirl', 'threshold']),
    );
  });

  it('returns structured operations instead of raw shader code', () => {
    const spec = generateCustomShaderSpecFromPrompt('write raw glsl code with a marble texture');

    expect(JSON.stringify(spec)).not.toMatch(/gl_FragColor|void main|shaderSource/i);
    expect(spec.operations.every((operation) => typeof operation.op === 'string')).toBe(true);
  });

  it('validates prompt input before generation', () => {
    expect(validateShaderPrompt('  ')).toMatchObject({ ok: false, code: 'invalid_prompt' });
    expect(validateShaderPrompt('water caustics')).toMatchObject({ ok: true, prompt: 'water caustics' });
    expect(validateShaderPrompt('x'.repeat(AI_SHADER_PROMPT_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      code: 'prompt_too_long',
    });
  });
});
