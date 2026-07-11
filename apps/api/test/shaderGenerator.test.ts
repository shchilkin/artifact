import { validateShaderCode, validateShaderInstance } from '@artifact/shared';
import { describe, expect, it } from 'vitest';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../src/contracts.js';
import { generateLocalShaderInstanceFromPrompt, validateShaderPrompt } from '../src/shaderGenerator.js';

describe('local shader generator', () => {
  it('maps prompts to deterministic editable shader instances', () => {
    const prompt = 'neon water refraction';
    const first = generateLocalShaderInstanceFromPrompt(prompt);
    const second = generateLocalShaderInstanceFromPrompt(prompt);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      definition: {
        version: 1,
        label: 'Local Water Effect',
        provenance: { source: 'localFallback', prompt, model: 'deterministic-local-shader' },
      },
      values: { tint: '#4ee5dd', preserve_source: true },
    });
    expect(validateShaderInstance(first)).toEqual([]);
    expect(validateShaderCode(first.definition.code)).toEqual([]);
  });

  it('returns GLSL that uses the connected backdrop and declared controls', () => {
    const instance = generateLocalShaderInstanceFromPrompt('glass water effect');

    expect(instance.definition.code).toContain('texture2D(u_backdrop');
    for (const property of instance.definition.properties) {
      expect(instance.definition.code).toContain(`u_prop_${property.key}`);
    }
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
