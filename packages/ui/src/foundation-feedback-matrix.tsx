import type { ReactNode } from 'react';
import { InlineNotice, ProgressIndicator, Skeleton } from './feedback';
import type { FeedbackFoundationSpecimenId } from './foundation-feedback-specimens';

export function FoundationFeedbackMatrix() {
  return (
    <div className="ui-foundation-matrix" data-foundation-section="feedback" aria-label="UI Foundation feedback matrix">
      <FeedbackSpecimen id="notice-info" label="InlineNotice / info">
        <InlineNotice variant="info">Project changes stay on this device.</InlineNotice>
      </FeedbackSpecimen>
      <FeedbackSpecimen id="notice-success" label="InlineNotice / success">
        <InlineNotice variant="success">Export is ready.</InlineNotice>
      </FeedbackSpecimen>
      <FeedbackSpecimen id="notice-warning" label="InlineNotice / warning">
        <InlineNotice variant="warning">The source image is low resolution.</InlineNotice>
      </FeedbackSpecimen>
      <FeedbackSpecimen id="notice-danger" label="InlineNotice / danger">
        <InlineNotice variant="danger">Export failed. Try again.</InlineNotice>
      </FeedbackSpecimen>
      <FeedbackSpecimen id="skeleton-line" label="Skeleton / line">
        <div className="ui-foundation-feedback-stack">
          <Skeleton />
          <Skeleton />
          <Skeleton className="ui-foundation-skeleton-short" />
        </div>
      </FeedbackSpecimen>
      <FeedbackSpecimen id="skeleton-block" label="Skeleton / named block">
        <Skeleton label="Loading project preview" shape="block" />
      </FeedbackSpecimen>
      <FeedbackSpecimen id="progress-indeterminate" label="ProgressIndicator / indeterminate">
        <ProgressIndicator label="Rendering preview" />
      </FeedbackSpecimen>
      <FeedbackSpecimen id="progress-determinate" label="ProgressIndicator / determinate">
        <ProgressIndicator label="Exporting document" value={72} />
      </FeedbackSpecimen>
    </div>
  );
}

function FeedbackSpecimen({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: FeedbackFoundationSpecimenId;
  label: string;
}) {
  return (
    <div className="ui-foundation-specimen ui-foundation-specimen--feedback" data-foundation-specimen={id}>
      <span className="ui-foundation-specimen__label">{label}</span>
      <div className="ui-foundation-specimen__control">{children}</div>
    </div>
  );
}
