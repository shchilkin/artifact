import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FONT_NAMES } from '../../../../types/config';
import { FontPicker } from './FontPicker';
import { InspectorColorInput } from './InspectorColorInput';
import { InspectorReadout } from './InspectorReadout';
import { InspectorSection } from './InspectorSection';
import { InspectorSelect } from './InspectorSelect';
import { InspectorSlider } from './InspectorSlider';
import { InspectorStateProvider } from './InspectorStateProvider';
import { InspectorTextArea } from './InspectorTextArea';
import { InspectorTextInput } from './InspectorTextInput';
import { InspectorToggle } from './InspectorToggle';

describe('runtime inspector field adapters', () => {
  it('renders the source-owned dense inspector section contract', () => {
    const html = renderToStaticMarkup(
      <InspectorSection title="Transform" summary="Position and scale" open onToggle={() => {}}>
        <span>Controls</span>
      </InspectorSection>,
    );

    expect(html).toContain('data-inspector-section="true"');
    expect(html).toContain('data-inspector-density="dense"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('node-inspector-section');
    expect(html).toContain('Controls');
  });

  it('exposes owning layer edit and lock state without disabling its section', () => {
    const html = renderToStaticMarkup(
      <InspectorStateProvider value={{ dirty: true, locked: true }}>
        <InspectorSection title="Appearance" open onToggle={() => {}}>
          <span>Controls</span>
        </InspectorSection>
      </InspectorStateProvider>,
    );

    expect(html).toContain('data-inspector-dirty="true"');
    expect(html).toContain('data-inspector-locked="true"');
    expect(html).toContain('>Edited</span>');
    expect(html).toContain('>Lock</span>');
    expect(html).not.toContain('disabled=""');
  });

  it('associates select labels through the source-owned inspector field contract', () => {
    const html = renderToStaticMarkup(
      <InspectorSelect label="Blend" value="normal" options={['normal', 'multiply']} disabled onChange={() => {}} />,
    );

    expect(html).toContain('data-inspector-field="true"');
    expect(html).toContain('data-inspector-disabled="true"');
    expect(html).toContain('<label');
    expect(html).toContain('for=');
    expect(html).toContain('<select');
    expect(html).toContain('disabled=""');
  });

  it('renders sliders as labelled dense property rows with explicit values', () => {
    const html = renderToStaticMarkup(
      <InspectorSlider label="Opacity" value={82} valueLabel="82%" min={0} max={100} disabled onChange={() => {}} />,
    );

    expect(html).toContain('data-inspector-property-row="true"');
    expect(html).toContain('data-inspector-disabled="true"');
    expect(html).toContain('<label');
    expect(html).toContain('for=');
    expect(html).toContain('<output');
    expect(html).toContain('82%');
    expect(html).toContain('type="range"');
    expect(html).toContain('disabled=""');
  });

  it('renders color and toggle controls as labelled dense property rows', () => {
    const html = renderToStaticMarkup(
      <>
        <InspectorColorInput label="Tint" value="#88402f" disabled onChange={() => {}} />
        <InspectorToggle label="Invert" checked disabled locked onChange={() => {}} />
      </>,
    );

    expect(html.match(/data-inspector-property-row="true"/g)).toHaveLength(2);
    expect(html.match(/data-inspector-disabled="true"/g)).toHaveLength(2);
    expect(html).toContain('data-inspector-locked="true"');
    expect(html.match(/<label/g)).toHaveLength(2);
    expect(html).toContain('type="color"');
    expect(html).toContain('type="checkbox"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('associates text controls with visible inspector labels and validation state', () => {
    const html = renderToStaticMarkup(
      <>
        <InspectorTextInput label="Node name" value="Transform" validation="valid" dirty onChange={() => {}} />
        <InspectorTextArea
          controlId="shader-code"
          label="Shader code"
          value=""
          error="Enter shader code."
          validation="invalid"
          onChange={() => {}}
        />
      </>,
    );

    expect(html.match(/data-inspector-field="true"/g)).toHaveLength(2);
    expect(html).toContain('data-inspector-dirty="true"');
    expect(html).toContain('data-inspector-validation="valid"');
    expect(html).toContain('data-inspector-validation="invalid"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-errormessage="shader-code-error"');
    expect(html).toContain('Enter shader code.');
    expect(html.match(/<label/g)).toHaveLength(2);
  });

  it('associates the custom font-picker trigger with the inspector field label', () => {
    const html = renderToStaticMarkup(<FontPicker label="Font" value={FONT_NAMES[0]} onChange={() => {}} />);

    expect(html).toContain('data-inspector-field="true"');
    expect(html).toContain('class="font-picker"');
    expect(html).toContain('<label');
    expect(html).toContain('for=');
    expect(html).toContain('font-picker-trigger');
    expect(html).toContain('aria-expanded="false"');
  });

  it('renders connected resource metadata as a labelled read-only readout', () => {
    const html = renderToStaticMarkup(
      <InspectorReadout
        detail="Texture metadata"
        label="Base color map"
        status="Read-only · Controlled by graph input"
        value="Connected node input"
      />,
    );

    expect(html).toContain('data-inspector-property-row="true"');
    expect(html).toContain('Read-only · Controlled by graph input');
    expect(html).toContain('<output');
    expect(html).toContain('Connected node input');
    expect(html).toContain('Texture metadata');
  });
});
