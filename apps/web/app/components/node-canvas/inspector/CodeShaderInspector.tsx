import { useMemo, useState } from 'react';
import type {
  GraphShaderNode,
  ShaderPropertyDefinition,
  ShaderPropertyType,
  ShaderPropertyValue,
} from '../../../types/config';
import { makeDefaultCodeShaderInstance, validateCustomShaderCode } from '../../../utils/customShaderCode';
import { compileCustomCodeShaderForDiagnostics } from '../../../utils/render/customCodeShader';
import { codeShaderUniformControls, makeCodeShaderProperty } from './CodeShaderInspectorModel';
import {
  InspectorColorInput,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextArea,
  InspectorToggle,
} from './fields';
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
          value={code}
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
          <code>u_strength</code> are also available. Empty code stays transparent; compile errors use a safe fallback.
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

function ShaderPropertyControl({
  property,
  value,
  onChange,
  onRemove,
}: {
  property: ShaderPropertyDefinition;
  value: ShaderPropertyValue;
  onChange: (value: ShaderPropertyValue) => void;
  onRemove: () => void;
}) {
  const label = `${property.label} · u_prop_${property.key}`;
  return (
    <div className="node-shader-property-control">
      <div>
        {property.type === 'color' ? (
          <InspectorColorInput
            label={label}
            value={typeof value === 'string' ? value : property.default}
            onChange={onChange}
          />
        ) : property.type === 'boolean' ? (
          <InspectorToggle
            label={label}
            checked={typeof value === 'boolean' ? value : property.default}
            onChange={onChange}
          />
        ) : (
          <InspectorSlider
            label={label}
            value={typeof value === 'number' ? value : property.default}
            min={property.min}
            max={property.max}
            step={property.step}
            onChange={onChange}
          />
        )}
      </div>
      <button
        type="button"
        className="node-shader-property-remove nodrag nopan nowheel"
        aria-label={`Remove ${property.label}`}
        title={`Remove ${property.label}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
