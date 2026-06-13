import type { GraphTransformNode } from '../../../types/config';
import { InspectorSelect, InspectorSlider, InspectorTextInput, InspectorToggle } from './fields';

function scalePatch(transformNode: GraphTransformNode, value: number): Partial<GraphTransformNode> {
  if (transformNode.uniformScale) return { scaleX: value, scaleY: value };
  return { scaleX: value };
}

export function TransformInspector({
  transformNode,
  onChange,
  detached = false,
}: {
  transformNode: GraphTransformNode;
  onChange: (patch: Partial<GraphTransformNode>) => void;
  detached?: boolean;
}) {
  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={transformNode.name} onChange={(name) => onChange({ name })} />
      <InspectorSlider
        label="Horizontal"
        value={transformNode.x}
        min={-100}
        max={100}
        overrideMax={240}
        onChange={(x) => onChange({ x })}
      />
      <InspectorSlider
        label="Vertical"
        value={transformNode.y}
        min={-100}
        max={100}
        overrideMax={240}
        onChange={(y) => onChange({ y })}
      />
      <InspectorToggle
        label="Equal scale"
        checked={transformNode.uniformScale}
        onChange={(uniformScale) =>
          onChange({
            uniformScale,
            ...(uniformScale ? { scaleY: transformNode.scaleX } : {}),
          })
        }
      />
      {transformNode.uniformScale ? (
        <InspectorSlider
          label="Scale"
          value={transformNode.scaleX}
          min={1}
          max={240}
          overrideMax={500}
          onChange={(scale) => onChange(scalePatch(transformNode, scale))}
        />
      ) : (
        <>
          <InspectorSlider
            label="Scale X"
            value={transformNode.scaleX}
            min={1}
            max={240}
            overrideMax={500}
            onChange={(scaleX) => onChange({ scaleX })}
          />
          <InspectorSlider
            label="Scale Y"
            value={transformNode.scaleY}
            min={1}
            max={240}
            overrideMax={500}
            onChange={(scaleY) => onChange({ scaleY })}
          />
        </>
      )}
      <InspectorSlider
        label="Rotation"
        value={transformNode.rotation}
        min={-180}
        max={180}
        onChange={(rotation) => onChange({ rotation })}
      />
      <InspectorSelect
        label="Pivot"
        value={transformNode.pivotMode ?? 'canvas'}
        options={[
          { value: 'canvas', label: 'Canvas center' },
          { value: 'visible', label: 'Visible center' },
        ]}
        onChange={(pivotMode) => onChange({ pivotMode: pivotMode as GraphTransformNode['pivotMode'] })}
      />
      <InspectorSlider
        label="Opacity"
        value={transformNode.opacity}
        min={0}
        max={100}
        onChange={(opacity) => onChange({ opacity })}
      />
      <p className="node-inspector-note">Transforms the completed source branch after masks and effects render.</p>
    </div>
  );
}
