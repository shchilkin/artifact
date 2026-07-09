import { useMemo, useState } from 'react';
import type { GraphShaderNode } from '../../../types/config';
import { DEFAULT_CUSTOM_SHADER_CODE, validateCustomShaderCode } from '../../../utils/customShaderCode';
import { compileCustomCodeShaderForDiagnostics } from '../../../utils/render/customCodeShader';
import { codeShaderUniformControls } from './CodeShaderInspectorModel';
import { InspectorSection, InspectorSlider, InspectorTextArea } from './fields';
import { ShaderStatusMessage } from './ShaderStatusMessage';

export function CodeShaderInspector({
  shaderNode,
  onChange,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
}) {
  const [codeOpen, setCodeOpen] = useState(true);
  const [uniformsOpen, setUniformsOpen] = useState(true);
  const code = shaderNode.customShaderCode?.code ?? DEFAULT_CUSTOM_SHADER_CODE.code;
  const issues = useMemo(() => validateCustomShaderCode(code), [code]);
  const compileResult = useMemo(() => {
    if (issues.some((issue) => issue.severity === 'error')) return null;
    return compileCustomCodeShaderForDiagnostics(code);
  }, [code, issues]);
  const blockingIssue = issues.find((issue) => issue.severity === 'error') ?? null;
  const empty = code.trim().length === 0;
  const uniformControls = codeShaderUniformControls(code);
  const status = empty
    ? {
        title: 'Start with code',
        message: 'Add mainImage(uv). The output stays transparent until code is added.',
        tone: 'info' as const,
      }
    : blockingIssue
      ? {
          title: 'Code needs a fix',
          message: blockingIssue.message,
          tone: 'warning' as const,
        }
      : compileResult && !compileResult.ok
        ? {
            title: 'Could not compile',
            message: compileResult.message ?? 'Check the shader code and try again.',
            tone: 'warning' as const,
          }
        : compileResult?.ok
          ? {
              title: 'Shader ready',
              message: 'The code compiles and can render in the preview.',
              tone: 'success' as const,
            }
          : null;
  const summary = empty
    ? 'empty'
    : blockingIssue
      ? 'needs attention'
      : compileResult && !compileResult.ok
        ? 'compile error'
        : compileResult?.ok
          ? 'ready'
          : 'checking';

  return (
    <>
      <InspectorSection title="Code" summary={summary} open={codeOpen} onToggle={() => setCodeOpen((open) => !open)}>
        {status ? <ShaderStatusMessage {...status} /> : null}
        <InspectorTextArea
          value={code}
          rows={12}
          placeholder="vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }"
          onChange={(value) =>
            onChange({
              customShaderCode: {
                version: 1,
                language: 'glsl-fragment',
                code: value,
              },
            })
          }
        />
        <p className="node-inspector-note">
          Write GLSL for <code>mainImage(uv)</code>. Use <code>u_backdrop</code> for the incoming image and{' '}
          <code>u_has_backdrop</code> to detect it. <code>u_resolution</code>, <code>u_seed</code>, and{' '}
          <code>u_strength</code> are also available. Empty code stays transparent; compile errors use a safe fallback.
        </p>
      </InspectorSection>
      {uniformControls.length > 0 && (
        <InspectorSection
          title="Inputs"
          summary={uniformControls.join(' / ')}
          open={uniformsOpen}
          onToggle={() => setUniformsOpen((open) => !open)}
        >
          <div className="node-shader-flat-controls">
            {uniformControls.includes('strength') && (
              <InspectorSlider
                label="Strength"
                value={shaderNode.distortion}
                min={0}
                max={100}
                onChange={(value) => onChange({ distortion: value })}
              />
            )}
            {uniformControls.includes('variation') && (
              <InspectorSlider
                label="Variation"
                value={shaderNode.seedOffset}
                min={0}
                max={9999}
                onChange={(value) => onChange({ seedOffset: value })}
              />
            )}
          </div>
        </InspectorSection>
      )}
    </>
  );
}
