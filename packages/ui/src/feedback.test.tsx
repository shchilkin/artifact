import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_FOUNDATION_SPECIMEN_IDS,
  FoundationFeedbackMatrix,
  InlineNotice,
  ProgressIndicator,
  Skeleton,
} from './index';

describe('UI Foundation feedback and async states', () => {
  it('maps notice variants to calm and urgent announcement semantics', () => {
    const markup = renderToStaticMarkup(
      <>
        <InlineNotice variant="info">Draft saved locally.</InlineNotice>
        <InlineNotice variant="success">Export complete.</InlineNotice>
        <InlineNotice variant="warning">Connection is unstable.</InlineNotice>
        <InlineNotice variant="danger">Export failed.</InlineNotice>
      </>,
    );

    expect(markup).toContain('class="ui-inline-notice ui-inline-notice--info" role="status"');
    expect(markup).toContain('class="ui-inline-notice ui-inline-notice--success" role="status"');
    expect(markup).toContain('class="ui-inline-notice ui-inline-notice--warning" role="status"');
    expect(markup).toContain('class="ui-inline-notice ui-inline-notice--danger" role="alert"');
  });

  it('keeps decorative skeletons silent and supports a named polite loading status', () => {
    const markup = renderToStaticMarkup(
      <>
        <Skeleton />
        <Skeleton label="Loading project preview" shape="block" />
      </>,
    );

    expect(markup).toContain('class="ui-skeleton ui-skeleton--line" aria-hidden="true"');
    expect(markup).toContain(
      'class="ui-skeleton ui-skeleton--block" role="status" aria-live="polite" aria-label="Loading project preview"',
    );
  });

  it('distinguishes determinate progress from indeterminate busy work', () => {
    const markup = renderToStaticMarkup(
      <>
        <ProgressIndicator label="Rendering preview" />
        <ProgressIndicator label="Exporting document" value={72} max={100} />
        <ProgressIndicator label="Clamped upload" value={120} max={100} />
      </>,
    );

    expect(markup).toContain('role="progressbar" aria-label="Rendering preview" aria-busy="true"');
    expect(markup).toContain(
      'role="progressbar" aria-label="Exporting document" aria-valuemin="0" aria-valuemax="100" aria-valuenow="72"',
    );
    expect(markup).toContain('aria-label="Clamped upload" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"');
  });

  it('publishes one deterministic feedback specimen set for both Product Themes', () => {
    const markup = renderToStaticMarkup(<FoundationFeedbackMatrix />);

    expect(FEEDBACK_FOUNDATION_SPECIMEN_IDS).toEqual([
      'notice-info',
      'notice-success',
      'notice-warning',
      'notice-danger',
      'skeleton-line',
      'skeleton-block',
      'progress-indeterminate',
      'progress-determinate',
    ]);
    for (const id of FEEDBACK_FOUNDATION_SPECIMEN_IDS) {
      expect(markup).toContain(`data-foundation-specimen="${id}"`);
    }
  });
});
