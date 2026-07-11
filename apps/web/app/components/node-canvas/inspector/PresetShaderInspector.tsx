import { useState } from 'react';
import type { GraphShaderNode } from '../../../types/config';
import { normalizeShaderPalette, shaderPaletteConfig } from '../../../utils/shaderPalette';
import { InspectorColorInput, InspectorSection, InspectorSlider } from './fields';
import { ShaderCompositeSection } from './ShaderCompositeSection';
import {
  type ShaderPlacementControlField,
  type ShaderShapeControlField,
  shaderPresetControlConfig,
} from './ShaderInspectorMetadata';

export function PresetShaderInspector({
  shaderNode,
  onChange,
  sourceConnected,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  sourceConnected: boolean;
}) {
  const [colorsOpen, setColorsOpen] = useState(true);
  const [shapeOpen, setShapeOpen] = useState(true);
  const [textureOpen, setTextureOpen] = useState(true);
  const [placementOpen, setPlacementOpen] = useState(false);
  const controls = shaderPresetControlConfig(shaderNode.shaderKind);
  const palette = normalizeShaderPalette(shaderNode.shaderKind, shaderNode.palette);

  return (
    <>
      <InspectorSection
        title="Colors"
        summary={`${palette.length} colors`}
        open={colorsOpen}
        onToggle={() => setColorsOpen((open) => !open)}
      >
        <ShaderColorGrid shaderNode={shaderNode} onChange={onChange} />
      </InspectorSection>
      {controls.shape.length > 0 && (
        <InspectorSection
          title="Shape"
          summary={controls.shape.map(shapeControlLabel).join(' / ')}
          open={shapeOpen}
          onToggle={() => setShapeOpen((open) => !open)}
        >
          <div className="node-shader-flat-controls">
            {controls.shape.map((field) => (
              <ShapeControl key={field} field={field} shaderNode={shaderNode} onChange={onChange} />
            ))}
          </div>
        </InspectorSection>
      )}
      <InspectorSection
        title="Texture"
        summary="grain / variation"
        open={textureOpen}
        onToggle={() => setTextureOpen((open) => !open)}
      >
        <div className="node-shader-flat-controls">
          <InspectorSlider
            label="Grain"
            value={shaderNode.grain}
            min={0}
            max={100}
            onChange={(value) => onChange({ grain: value })}
          />
          <InspectorSlider
            label="Variation"
            value={shaderNode.seedOffset}
            min={0}
            max={9999}
            onChange={(value) => onChange({ seedOffset: value })}
          />
        </div>
      </InspectorSection>
      {controls.placement.length > 0 && (
        <InspectorSection
          title="Placement"
          summary={controls.placement.map(placementControlLabel).join(' / ')}
          open={placementOpen}
          onToggle={() => setPlacementOpen((open) => !open)}
        >
          <div className="node-shader-flat-controls">
            {controls.placement.map((field) => (
              <PlacementControl key={field} field={field} shaderNode={shaderNode} onChange={onChange} />
            ))}
          </div>
        </InspectorSection>
      )}
      {sourceConnected && <ShaderCompositeSection shaderNode={shaderNode} onChange={onChange} />}
    </>
  );
}

function ShaderColorGrid({
  shaderNode,
  onChange,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
}) {
  const config = shaderPaletteConfig(shaderNode.shaderKind);
  const palette = normalizeShaderPalette(shaderNode.shaderKind, shaderNode.palette);
  const updatePalette = (nextPalette: string[]) => {
    onChange({ palette: normalizeShaderPalette(shaderNode.shaderKind, nextPalette) });
  };

  return (
    <>
      <div className="node-shader-color-grid">
        {palette.map((color, index) => (
          <div key={`shader-palette-${index}`} className="node-shader-color-swatch">
            <InspectorColorInput
              label={paletteLabel(index)}
              value={color}
              onChange={(value) => {
                const nextPalette = [...palette];
                nextPalette[index] = value;
                updatePalette(nextPalette);
              }}
            />
            {palette.length > config.min && (
              <button
                type="button"
                className="node-shader-color-remove nodrag nopan nowheel"
                aria-label={`Remove color ${paletteLabel(index)}`}
                title={`Remove color ${paletteLabel(index)}`}
                onClick={() => updatePalette(palette.filter((_, colorIndex) => colorIndex !== index))}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {config.addable && palette.length < config.max && (
        <button
          type="button"
          className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
          onClick={() =>
            updatePalette([...palette, config.defaults[palette.length % config.defaults.length] ?? '#ffffff'])
          }
        >
          Add Color
        </button>
      )}
    </>
  );
}

function ShapeControl({
  field,
  shaderNode,
  onChange,
}: {
  field: ShaderShapeControlField;
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
}) {
  if (field === 'distortion') {
    return (
      <InspectorSlider
        label="Distortion"
        value={shaderNode.distortion}
        min={0}
        max={100}
        onChange={(value) => onChange({ distortion: value })}
      />
    );
  }
  if (field === 'swirl') {
    return (
      <InspectorSlider
        label="Swirl"
        value={shaderNode.swirl}
        min={0}
        max={100}
        onChange={(value) => onChange({ swirl: value })}
      />
    );
  }
  return (
    <InspectorSlider
      label="Scale"
      value={shaderNode.scale}
      min={20}
      max={300}
      onChange={(value) => onChange({ scale: value })}
    />
  );
}

function PlacementControl({
  field,
  shaderNode,
  onChange,
}: {
  field: ShaderPlacementControlField;
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
}) {
  if (field === 'rotation') {
    return (
      <InspectorSlider
        label="Rotation"
        value={shaderNode.rotation}
        min={0}
        max={360}
        onChange={(value) => onChange({ rotation: value })}
      />
    );
  }
  if (field === 'offsetX') {
    return (
      <InspectorSlider
        label="Offset X"
        value={shaderNode.offsetX}
        min={-100}
        max={100}
        onChange={(value) => onChange({ offsetX: value })}
      />
    );
  }
  return (
    <InspectorSlider
      label="Offset Y"
      value={shaderNode.offsetY}
      min={-100}
      max={100}
      onChange={(value) => onChange({ offsetY: value })}
    />
  );
}

function shapeControlLabel(field: ShaderShapeControlField) {
  if (field === 'distortion') return 'distortion';
  return field;
}

function placementControlLabel(field: ShaderPlacementControlField) {
  if (field === 'offsetX') return 'x';
  if (field === 'offsetY') return 'y';
  return 'rotation';
}

function paletteLabel(index: number) {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}
