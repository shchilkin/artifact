import { useMemo, useState } from 'react';
import type { GraphShaderNode, ShaderPropertyType } from '../../../types/config';
import { makeDefaultCodeShaderInstance, validateCustomShaderCode } from '../../../utils/customShaderCode';
import { compileCustomCodeShaderForDiagnostics } from '../../../utils/render/customCodeShader';
import { codeShaderUniformControls, makeCodeShaderProperty } from './CodeShaderInspectorModel';
import { InspectorSection, InspectorSelect, InspectorSlider, InspectorTextArea } from './fields';
import { ShaderPropertyControl } from './ShaderPropertyControl';
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
  const [newPropertyType, setNewPropertyType] = useState<ShaderPropertyType>('number');
  const shaderInstance = shaderNode.shaderInstance ?? makeDefaultCodeShaderInstance(shaderNode.id);
  const definition = shaderInstance.definition;
  const code = definition.code;
  const issues = useMemo(() => validateCustomShaderCode(code), [code]);
  const compileResult = useMemo(() => {
    if (issues.some((issue) => issue.severity === 'error')) return null;
    return compileCustomCodeShaderForDiagnostics(code, definition.properties);
  }, [code, definition.properties, issues]);
  const blockingIssue = issues.find((issue) => issue.severity === 'error') ?? null;
  const empty = code.trim().length === 0;
  const initialCode = useState(code)[0];
  const dirty = code !== initialCode;
  const validation = empty ? 'idle' : blockingIssue || (compileResult && !compileResult.ok) ? 'invalid' : 'valid';
  const validationError =
    validation === 'invalid'
      ? (blockingIssue?.message ?? compileResult?.message ?? 'Check the shader code and try again.')
      : undefined;
  const uniformControls = codeShaderUniformControls(code);
  const updateInstance = (patch: Partial<typeof shaderInstance>) =>
    onChange({ shaderInstance: { ...shaderInstance, ...patch } });
  const addProperty = () => {
    const property = makeCodeShaderProperty(newPropertyType, definition.properties);
    updateInstance({
      definition: { ...definition, properties: [...definition.properties, property] },
      values: { ...shaderInstance.values, [property.key]: property.default },
    });
  };
  const removeProperty = (key: string) => {
    const values = { ...shaderInstance.values };
    delete values[key];
    updateInstance({
      definition: { ...definition, properties: definition.properties.filter((property) => property.key !== key) },
      values,
    });
  };
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
          controlId={`code-shader-${shaderNode.id}`}
          label="Shader code"
          value={code}
          dirty={dirty}
          error={validationError}
          status={validation === 'valid' ? 'Accepted by the browser shader compiler.' : undefined}
          validation={validation}
          rows={12}
          placeholder="vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }"
          onChange={(value) =>
            onChange({
              shaderInstance: {
                ...shaderInstance,
                definition: { ...definition, code: value },
              },
            })
          }
        />
        <p className="node-inspector-note">
          Write GLSL for <code>mainImage(uv)</code>. Use <code>u_backdrop</code> for the incoming image and{' '}
          <code>u_has_backdrop</code> to detect it. <code>u_resolution</code>, <code>u_seed</code>, and{' '}
          <code>u_strength</code> are also available. Empty or invalid code stays transparent until it is fixed.
        </p>
      </InspectorSection>
      <InspectorSection
        title="Controls"
        summary={`${uniformControls.length + definition.properties.length} controls`}
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
          {definition.properties.map((property) => (
            <ShaderPropertyControl
              key={property.key}
              property={property}
              value={shaderInstance.values[property.key] ?? property.default}
              onChange={(nextValue) =>
                updateInstance({ values: { ...shaderInstance.values, [property.key]: nextValue } })
              }
              onRemove={() => removeProperty(property.key)}
            />
          ))}
        </div>
        {definition.properties.length < 12 && (
          <div className="node-shader-property-authoring">
            <InspectorSelect
              label="New control"
              value={newPropertyType}
              options={[
                { value: 'number', label: 'Number' },
                { value: 'color', label: 'Color' },
                { value: 'boolean', label: 'Toggle' },
              ]}
              onChange={(value) => setNewPropertyType(value as ShaderPropertyType)}
            />
            <button type="button" className="node-shell-action nodrag nopan nowheel" onClick={addProperty}>
              Add control
            </button>
          </div>
        )}
      </InspectorSection>
    </>
  );
}
