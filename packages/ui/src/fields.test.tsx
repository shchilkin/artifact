import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIELD_FOUNDATION_SPECIMEN_IDS, Field, FoundationFieldMatrix, Input, NativeSelect, Textarea } from './index';

describe('UI Foundation fields', () => {
  it('associates a label, hint, and error with its input', () => {
    const markup = renderToStaticMarkup(
      <Field controlId="project-title" label="Project title" hint="Shown in the project list." error="Required.">
        <Input aria-describedby="project-title-details" name="title" />
      </Field>,
    );

    expect(markup).toContain('<label class="ui-field__label" for="project-title"');
    expect(markup).toContain('id="project-title"');
    expect(markup).toContain('aria-describedby="project-title-details project-title-hint project-title-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-errormessage="project-title-error"');
    expect(markup).toContain('id="project-title-hint"');
    expect(markup).toContain('id="project-title-error"');
  });

  it('preserves native field state and ref contracts', () => {
    const inputRef = createRef<HTMLInputElement>();
    const textareaRef = createRef<HTMLTextAreaElement>();
    const selectRef = createRef<HTMLSelectElement>();
    const markup = renderToStaticMarkup(
      <>
        <Input ref={inputRef} aria-label="Locked title" readOnly value="Archive" />
        <Textarea ref={textareaRef} aria-label="Disabled notes" disabled defaultValue="Unavailable" />
        <NativeSelect ref={selectRef} aria-label="Format" defaultValue="png">
          <option value="png">PNG</option>
        </NativeSelect>
      </>,
    );

    expect(markup).toContain('readOnly=""');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('<select');
  });

  it('uses a control-provided id as the Field association source of truth', () => {
    const markup = renderToStaticMarkup(
      <Field controlId="fallback-title" label="Project title">
        <Input id="custom-title" />
      </Field>,
    );

    expect(markup).toContain('for="custom-title"');
    expect(markup).toContain('id="custom-title"');
    expect(markup).not.toContain('fallback-title');
  });

  it('publishes one deterministic field specimen set for both Product Themes', () => {
    const markup = renderToStaticMarkup(<FoundationFieldMatrix />);

    expect(FIELD_FOUNDATION_SPECIMEN_IDS).toEqual([
      'input-default',
      'input-focus',
      'input-error',
      'input-disabled',
      'input-readonly',
      'textarea-default',
      'textarea-error',
      'textarea-disabled',
      'textarea-readonly',
      'native-select-default',
      'native-select-error',
      'native-select-disabled',
    ]);
    for (const id of FIELD_FOUNDATION_SPECIMEN_IDS) {
      expect(markup).toContain(`data-foundation-specimen="${id}"`);
    }
  });
});
