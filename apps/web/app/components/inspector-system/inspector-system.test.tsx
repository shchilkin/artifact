import { Input, NativeSelect } from '@artifact/ui';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  INSPECTOR_SPECIMEN_IDS,
  InspectorField,
  InspectorPatternSpecimens,
  InspectorSection,
  InspectorStatus,
  PropertyRow,
} from './index';

describe('Artifact inspector system contract', () => {
  it('associates field labels, hints, and validation while exposing edit state', () => {
    const html = renderToStaticMarkup(
      <InspectorField
        label="Cover title"
        hint="Shown on the artwork."
        error="Enter a title."
        dirty
        validation="invalid"
      >
        <Input name="title" defaultValue="" />
      </InspectorField>,
    );

    expect(html).toContain('data-inspector-field="true"');
    expect(html).toContain('data-inspector-dirty="true"');
    expect(html).toContain('data-inspector-validation="invalid"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-errormessage=');
    expect(html).toContain('Shown on the artwork.');
    expect(html).toContain('Enter a title.');
  });

  it('keeps locked state distinct from native disabled state', () => {
    const html = renderToStaticMarkup(
      <>
        <InspectorField label="Blend mode" locked status="Layer lock does not block property edits.">
          <NativeSelect defaultValue="normal">
            <option value="normal">Normal</option>
          </NativeSelect>
        </InspectorField>
        <InspectorField label="Output profile" disabled>
          <NativeSelect defaultValue="screen">
            <option value="screen">Screen</option>
          </NativeSelect>
        </InspectorField>
      </>,
    );

    expect(html).toContain('data-inspector-locked="true"');
    expect(html).toContain('Layer lock does not block property edits.');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain('>Lock<');
    expect(html).toContain('>Unavailable<');
  });

  it('associates an explicit control id with custom inspector controls', () => {
    const html = renderToStaticMarkup(
      <InspectorField label="Font" controlId="font-picker-trigger" error="Could not import font." validation="invalid">
        <button type="button">Poster Sans</button>
      </InspectorField>,
    );

    expect(html).toContain('for="font-picker-trigger"');
    expect(html).toContain('id="font-picker-trigger"');
    expect(html).toContain('aria-errormessage="font-picker-trigger-error"');
    expect(html).toContain('aria-invalid="true"');
  });

  it('exposes section, property-row, and status state through stable public attributes', () => {
    expectTypeOf<ComponentProps<typeof InspectorStatus>>().not.toHaveProperty('variant');

    const html = renderToStaticMarkup(
      <InspectorSection
        title="Print controls"
        summary="4 controls"
        open
        density="dense"
        dirty
        locked
        loading
        validation="invalid"
        onToggle={() => {}}
      >
        <PropertyRow
          label="Opacity"
          value="82%"
          controlId="opacity"
          dirty
          error="Opacity is out of range."
          validation="validating"
          status="Checking range"
        >
          <input id="opacity" type="range" min="0" max="100" defaultValue="82" />
        </PropertyRow>
        <InspectorStatus tone="success" title="Ready">
          Values are valid.
        </InspectorStatus>
      </InspectorSection>,
    );

    expect(html).toContain('data-inspector-section="true"');
    expect(html).toContain('data-inspector-density="dense"');
    expect(html).toContain('data-inspector-dirty="true"');
    expect(html).toContain('data-inspector-locked="true"');
    expect(html).toContain('data-inspector-loading="true"');
    expect(html).toContain('data-inspector-validation="invalid"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-inspector-property-row="true"');
    expect(html).toContain('data-inspector-validation="validating"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-describedby="opacity-description opacity-state opacity-error"');
    expect(html).toContain('aria-errormessage="opacity-error"');
    expect(html).toContain('>Edited<');
    expect(html).toContain('>Checking<');
    expect(html).toContain('data-inspector-status="success"');
    expect(html).toContain('ui-inline-notice--success');
    expect(html).toContain('role="status"');
  });

  it('renders deterministic ordinary and dense inspector specimens without product state', () => {
    const html = renderToStaticMarkup(<InspectorPatternSpecimens />);

    for (const specimenId of Object.values(INSPECTOR_SPECIMEN_IDS)) {
      expect(html).toContain(`data-inspector-specimen="${specimenId}"`);
    }
    expect(html).toContain('data-inspector-dirty="true"');
    expect(html).toContain('data-inspector-disabled="true"');
    expect(html).toContain('data-inspector-locked="true"');
    expect(html).toContain('data-inspector-loading="true"');
    expect(html).toContain('data-inspector-validation="validating"');
    expect(html).toContain('data-inspector-validation="invalid"');
    expect(html).toContain('aria-invalid="true"');
  });
});
