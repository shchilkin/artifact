export type CodeShaderUniformControl = 'strength' | 'variation';

export function codeShaderUniformControls(code: string): CodeShaderUniformControl[] {
  const executableCode = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const controls: CodeShaderUniformControl[] = [];
  if (/\bu_strength\b/.test(executableCode)) controls.push('strength');
  if (/\bu_seed\b/.test(executableCode)) controls.push('variation');
  return controls;
}

export function makeCodeShaderProperty(
  type: ShaderPropertyType,
  existing: ShaderPropertyDefinition[],
): ShaderPropertyDefinition {
  const base =
    type === 'color'
      ? { key: 'tint', label: 'Tint' }
      : type === 'boolean'
        ? { key: 'enabled', label: 'Enabled' }
        : { key: 'amount', label: 'Amount' };
  const key = uniqueShaderPropertyKey(base.key, existing);
  const label = key === base.key ? base.label : `${base.label} ${key.slice(base.key.length)}`;
  if (type === 'color') return { type, key, label, default: '#ffffff' };
  if (type === 'boolean') return { type, key, label, default: true };
  return { type, key, label, default: 0.5, min: 0, max: 1, step: 0.01 };
}

function uniqueShaderPropertyKey(base: string, existing: ShaderPropertyDefinition[]) {
  const keys = new Set(existing.map((property) => property.key));
  if (!keys.has(base)) return base;
  let suffix = 2;
  while (keys.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

import type { ShaderPropertyDefinition, ShaderPropertyType } from '../../../types/config';
