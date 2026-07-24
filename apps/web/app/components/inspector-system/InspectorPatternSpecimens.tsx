import { Input, NativeSelect } from '@artifact/ui';
import { useState } from 'react';

import { InspectorField } from './InspectorField';
import { InspectorSection } from './InspectorSection';
import { InspectorStatus } from './InspectorStatus';
import { INSPECTOR_SPECIMEN_IDS } from './inspector-specimens';
import { PropertyRow } from './PropertyRow';
import './inspector-system.css';

export function InspectorPatternSpecimens() {
  return (
    <div className="artifact-inspector-specimens" aria-label="Inspector layout specimens">
      <OrdinaryInspectorSpecimen />
      <DenseInspectorSpecimen />
    </div>
  );
}

function OrdinaryInspectorSpecimen() {
  const [open, setOpen] = useState(true);

  return (
    <div className="artifact-inspector-specimen" data-inspector-specimen={INSPECTOR_SPECIMEN_IDS.ordinary}>
      <span className="artifact-inspector-specimen__label">Ordinary</span>
      <InspectorSection
        title="Artwork identity"
        summary="Readable field stack"
        open={open}
        onToggle={() => setOpen((value) => !value)}
      >
        <InspectorField label="Title" hint="Name this layer so it stays easy to find.">
          <Input defaultValue="Cover type" />
        </InspectorField>
        <InspectorField label="Edition" dirty status="Changed since the last document snapshot." validation="valid">
          <Input defaultValue="Side A" />
        </InspectorField>
        <InspectorField label="Copies" error="Enter one or more copies." validation="invalid">
          <Input type="number" min="1" defaultValue="0" />
        </InspectorField>
        <InspectorField label="Output profile" disabled status="Available after the output target is ready.">
          <NativeSelect defaultValue="screen">
            <option value="screen">Screen</option>
            <option value="print">Print</option>
          </NativeSelect>
        </InspectorField>
        <InspectorStatus tone="success" title="Saved locally">
          Property changes are in the current document.
        </InspectorStatus>
      </InspectorSection>
    </div>
  );
}

function DenseInspectorSpecimen() {
  const [open, setOpen] = useState(true);

  return (
    <div className="artifact-inspector-specimen" data-inspector-specimen={INSPECTOR_SPECIMEN_IDS.dense}>
      <span className="artifact-inspector-specimen__label">Dense</span>
      <InspectorSection
        density="dense"
        title="Print controls"
        summary="Fast scan · precise values"
        open={open}
        loading
        onToggle={() => setOpen((value) => !value)}
      >
        <PropertyRow
          controlId="inspector-specimen-opacity"
          label="Opacity"
          value="82%"
          dirty
          validation="validating"
          status="Checking the entered range."
        >
          <input className="artifact-inspector-range" type="range" min="0" max="100" defaultValue="82" />
        </PropertyRow>
        <PropertyRow
          controlId="inspector-specimen-blend"
          label="Blend"
          value="Screen"
          locked
          status="The layer lock protects reorder and delete; properties remain editable."
        >
          <NativeSelect defaultValue="screen">
            <option value="normal">Normal</option>
            <option value="screen">Screen</option>
            <option value="multiply">Multiply</option>
          </NativeSelect>
        </PropertyRow>
        <PropertyRow
          controlId="inspector-specimen-seed"
          label="Variation"
          value="031"
          disabled
          hint="This source does not expose seeded variation."
        >
          <Input type="number" defaultValue="31" />
        </PropertyRow>
        <InspectorStatus loading title="Checking values">
          Existing edits stay available while validation finishes.
        </InspectorStatus>
      </InspectorSection>
    </div>
  );
}
