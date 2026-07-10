import type { ShaderPropertyDefinition, ShaderPropertyValue } from '../../../types/config';
import { InspectorColorInput, InspectorSlider, InspectorToggle } from './fields';

export function ShaderPropertyControl({
  property,
  value,
  onChange,
  onRemove,
}: {
  property: ShaderPropertyDefinition;
  value: ShaderPropertyValue;
  onChange: (value: ShaderPropertyValue) => void;
  onRemove?: () => void;
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
      {onRemove ? (
        <button
          type="button"
          className="node-shader-property-remove nodrag nopan nowheel"
          aria-label={`Remove ${property.label}`}
          title={`Remove ${property.label}`}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
