export type CodeShaderUniformControl = 'strength' | 'variation';

export function codeShaderUniformControls(code: string): CodeShaderUniformControl[] {
  const executableCode = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const controls: CodeShaderUniformControl[] = [];
  if (/\bu_strength\b/.test(executableCode)) controls.push('strength');
  if (/\bu_seed\b/.test(executableCode)) controls.push('variation');
  return controls;
}
