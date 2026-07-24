import { type ChangeEvent, useRef, useState } from 'react';

import type { GraphMaterialNode, MaterialTextureInputPort } from '../../../types/config';
import { saveImageAsset } from '../../../utils/assetStore';
import { NoPan } from '../nodes/NoPan';
import { InspectorColorInput, InspectorReadout, InspectorSection, InspectorSlider, InspectorTextInput } from './fields';

type MaterialTextureSlot = {
  label: string;
  port: MaterialTextureInputPort;
  srcKey: keyof Pick<
    GraphMaterialNode,
    'materialAlbedoSrc' | 'materialRoughnessSrc' | 'materialMetalnessSrc' | 'materialNormalSrc' | 'materialAlphaSrc'
  >;
  nameKey: keyof Pick<
    GraphMaterialNode,
    | 'materialAlbedoName'
    | 'materialRoughnessName'
    | 'materialMetalnessName'
    | 'materialNormalName'
    | 'materialAlphaName'
  >;
  bytesKey: keyof Pick<
    GraphMaterialNode,
    | 'materialAlbedoBytes'
    | 'materialRoughnessBytes'
    | 'materialMetalnessBytes'
    | 'materialNormalBytes'
    | 'materialAlphaBytes'
  >;
  hint: string;
};

const TEXTURE_SLOTS: MaterialTextureSlot[] = [
  {
    label: 'Albedo',
    port: 'albedo',
    srcKey: 'materialAlbedoSrc',
    nameKey: 'materialAlbedoName',
    bytesKey: 'materialAlbedoBytes',
    hint: 'Base color map',
  },
  {
    label: 'Roughness',
    port: 'roughness',
    srcKey: 'materialRoughnessSrc',
    nameKey: 'materialRoughnessName',
    bytesKey: 'materialRoughnessBytes',
    hint: 'Surface microsurface map',
  },
  {
    label: 'Metalness',
    port: 'metalness',
    srcKey: 'materialMetalnessSrc',
    nameKey: 'materialMetalnessName',
    bytesKey: 'materialMetalnessBytes',
    hint: 'Metallic mask',
  },
  {
    label: 'Normal',
    port: 'normal',
    srcKey: 'materialNormalSrc',
    nameKey: 'materialNormalName',
    bytesKey: 'materialNormalBytes',
    hint: 'Tangent normal map',
  },
  {
    label: 'Alpha',
    port: 'alpha',
    srcKey: 'materialAlphaSrc',
    nameKey: 'materialAlphaName',
    bytesKey: 'materialAlphaBytes',
    hint: 'Transparency mask',
  },
];

export function MaterialInspector({
  materialNode,
  connectedTextureInputs,
  onChange,
  detached = false,
}: {
  materialNode: GraphMaterialNode;
  connectedTextureInputs?: ReadonlySet<MaterialTextureInputPort>;
  onChange: (patch: Partial<GraphMaterialNode>) => void;
  detached?: boolean;
}) {
  const [textureSectionOpen, setTextureSectionOpen] = useState(false);
  const albedoLocked = connectedTextureInputs?.has('albedo') ?? false;
  const roughnessLocked = connectedTextureInputs?.has('roughness') ?? false;
  const metalnessLocked = connectedTextureInputs?.has('metalness') ?? false;
  const normalLocked = connectedTextureInputs?.has('normal') ?? false;

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput label="Name" value={materialNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorColorInput
        label="Base"
        value={materialNode.materialBaseColor}
        disabled={albedoLocked}
        onChange={(value) => onChange({ materialBaseColor: value })}
      />
      <InspectorColorInput
        label="Light"
        value={materialNode.materialAccentColor}
        disabled={albedoLocked}
        onChange={(value) => onChange({ materialAccentColor: value })}
      />
      <InspectorSlider
        label="Metallic"
        value={Math.round(materialNode.materialMetalness * 100)}
        min={0}
        max={100}
        disabled={metalnessLocked}
        onChange={(value) => onChange({ materialMetalness: value / 100 })}
      />
      <InspectorSlider
        label="Roughness"
        value={Math.round(materialNode.materialRoughness * 100)}
        min={0}
        max={100}
        disabled={roughnessLocked}
        onChange={(value) => onChange({ materialRoughness: value / 100 })}
      />
      <InspectorSlider
        label="Coat"
        value={Math.round(materialNode.materialClearcoat * 100)}
        min={0}
        max={100}
        onChange={(value) => onChange({ materialClearcoat: value / 100 })}
      />
      <InspectorSlider
        label="Relief"
        value={Math.round(materialNode.materialRelief * 100)}
        min={0}
        max={100}
        disabled={normalLocked}
        onChange={(value) => onChange({ materialRelief: value / 100 })}
      />
      <InspectorSlider
        label="Grain"
        value={Math.round(materialNode.materialGrain * 100)}
        min={0}
        max={100}
        disabled={normalLocked}
        onChange={(value) => onChange({ materialGrain: value / 100 })}
      />
      <InspectorSlider
        label="Anisotropy"
        value={Math.round(materialNode.materialAnisotropy * 100)}
        min={0}
        max={100}
        onChange={(value) => onChange({ materialAnisotropy: value / 100 })}
      />
      <InspectorSection
        title="Texture Set"
        summary={materialTextureSummary(materialNode)}
        open={textureSectionOpen}
        onToggle={() => setTextureSectionOpen((open) => !open)}
      >
        {TEXTURE_SLOTS.map((slot) => (
          <MaterialTextureSlotControl
            key={slot.srcKey}
            slot={slot}
            materialNode={materialNode}
            lockedByInput={connectedTextureInputs?.has(slot.port) ?? false}
            onChange={onChange}
          />
        ))}
      </InspectorSection>
      <p className="node-inspector-note">Connect this surface to a 3D node material input.</p>
    </div>
  );
}

function materialTextureSummary(materialNode: GraphMaterialNode) {
  const count = TEXTURE_SLOTS.filter((slot) => materialNode[slot.srcKey]).length;
  return count > 0 ? `${count} map${count === 1 ? '' : 's'}` : 'Procedural maps';
}

function MaterialTextureSlotControl({
  slot,
  materialNode,
  lockedByInput,
  onChange,
}: {
  slot: MaterialTextureSlot;
  materialNode: GraphMaterialNode;
  lockedByInput: boolean;
  onChange: (patch: Partial<GraphMaterialNode>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const source = materialNode[slot.srcKey];
  const name = materialNode[slot.nameKey];
  const bytes = materialNode[slot.bytesKey];
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const src = loadEvent.target?.result;
      if (typeof src !== 'string') return;
      const patch = {
        [slot.nameKey]: file.name,
        [slot.bytesKey]: file.size,
      } as Partial<GraphMaterialNode>;
      void saveImageAsset(src)
        .then((assetSrc) => onChange({ ...patch, [slot.srcKey]: assetSrc }))
        .catch(() => onChange({ ...patch, [slot.srcKey]: src }));
    };
    reader.readAsDataURL(file);
  };
  const clearTexture = () =>
    onChange({
      [slot.srcKey]: '',
      [slot.nameKey]: '',
      [slot.bytesKey]: 0,
    } as Partial<GraphMaterialNode>);

  return (
    <div className="node-inspector-resource">
      <InspectorReadout
        label={slot.label}
        status={lockedByInput ? 'Read-only · Controlled by graph input' : undefined}
        value={lockedByInput ? 'Connected node input' : name || (source ? 'Embedded texture' : 'No texture')}
        detail={
          lockedByInput
            ? `${slot.hint} controlled by graph input`
            : source
              ? `${bytes ? `${Math.round(bytes / 1024)} KB · ` : ''}${slot.hint}`
              : slot.hint
        }
      />
      <div className="node-inspector-inline-actions">
        <NoPan
          as="button"
          type="button"
          className="node-inspector-action"
          disabled={lockedByInput}
          onClick={() => inputRef.current?.click()}
        >
          {source ? 'Replace' : 'Load'}
        </NoPan>
        {source && !lockedByInput ? (
          <NoPan as="button" type="button" className="node-inspector-action" onClick={clearTexture}>
            Clear
          </NoPan>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="node-hidden-file-input"
        disabled={lockedByInput}
        onChange={handleFileChange}
        tabIndex={-1}
      />
    </div>
  );
}
