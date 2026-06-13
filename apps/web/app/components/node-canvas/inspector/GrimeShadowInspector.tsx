import type { GraphGrimeShadowNode } from '../../../types/config';
import { InspectorColorInput, InspectorSlider, InspectorTextInput, InspectorToggle } from './fields';

export function GrimeShadowInspector({
  grimeShadowNode,
  onChange,
  detached = false,
}: {
  grimeShadowNode: GraphGrimeShadowNode;
  onChange: (patch: Partial<GraphGrimeShadowNode>) => void;
  detached?: boolean;
}) {
  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={grimeShadowNode.name} onChange={(name) => onChange({ name })} />
      <InspectorSlider
        label="Horizontal"
        value={grimeShadowNode.x}
        min={-120}
        max={120}
        overrideMax={260}
        onChange={(x) => onChange({ x })}
      />
      <InspectorSlider
        label="Vertical"
        value={grimeShadowNode.y}
        min={-120}
        max={120}
        overrideMax={260}
        onChange={(y) => onChange({ y })}
      />
      <InspectorSlider
        label="Layers"
        value={grimeShadowNode.layers}
        min={1}
        max={12}
        overrideMax={32}
        onChange={(layers) => onChange({ layers: Math.round(layers) })}
      />
      <InspectorSlider
        label="Blur"
        value={grimeShadowNode.blur}
        min={0}
        max={60}
        overrideMax={160}
        onChange={(blur) => onChange({ blur })}
      />
      <InspectorSlider
        label="Spread"
        value={grimeShadowNode.spread}
        min={0}
        max={80}
        overrideMax={220}
        onChange={(spread) => onChange({ spread })}
      />
      <InspectorSlider
        label="Grime"
        value={grimeShadowNode.grime}
        min={0}
        max={100}
        onChange={(grime) => onChange({ grime })}
      />
      <InspectorSlider
        label="Jitter"
        value={grimeShadowNode.jitter}
        min={0}
        max={80}
        overrideMax={220}
        onChange={(jitter) => onChange({ jitter })}
      />
      <InspectorColorInput label="Color" value={grimeShadowNode.color} onChange={(color) => onChange({ color })} />
      <InspectorSlider
        label="Opacity"
        value={grimeShadowNode.opacity}
        min={0}
        max={100}
        onChange={(opacity) => onChange({ opacity })}
      />
      <InspectorSlider
        label="Seed Offset"
        value={Math.round(grimeShadowNode.seedOffset ?? 0)}
        min={-999}
        max={999}
        overrideMax={9999}
        onChange={(seedOffset) => onChange({ seedOffset })}
      />
      <InspectorToggle
        label="Shadow only"
        checked={grimeShadowNode.shadowOnly}
        onChange={(shadowOnly) => onChange({ shadowOnly })}
      />
      <p className="node-inspector-note">Builds layered dirty shadow from the visible alpha of the source branch.</p>
    </div>
  );
}
