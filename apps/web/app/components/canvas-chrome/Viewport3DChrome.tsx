import type { MouseEvent, ReactNode } from 'react';

import { ToolbarButton } from '../ui/Toolbar';

import './viewport-3d-chrome.css';

export type Viewport3DStatus = 'loading' | 'ready' | 'unavailable' | 'failed';

export function resolveViewport3DStatus({
  hasRenderedFrame,
  unavailable = false,
  failed = false,
}: {
  hasRenderedFrame: boolean;
  unavailable?: boolean;
  failed?: boolean;
}): Viewport3DStatus {
  if (unavailable) return 'unavailable';
  if (failed) return 'failed';
  return hasRenderedFrame ? 'ready' : 'loading';
}

export function viewport3DClassName({
  className,
  interactive,
  locked,
  status,
}: {
  className?: string;
  interactive: boolean;
  locked: boolean;
  status: Viewport3DStatus;
}) {
  return [
    'artifact-viewport3d',
    'node-interactive-viewport',
    `artifact-viewport3d--${status}`,
    interactive ? 'artifact-viewport3d--interactive' : 'artifact-viewport3d--passive',
    locked ? 'artifact-viewport3d--locked' : 'artifact-viewport3d--unlocked',
    className,
    locked || !interactive ? null : 'nodrag nopan nowheel',
  ]
    .filter(Boolean)
    .join(' ');
}

export function Viewport3DStatusOverlay({
  status,
  label,
  secondaryStatus,
  secondaryRecovery,
  recovery,
}: {
  status: Viewport3DStatus;
  label: string;
  secondaryStatus?: ReactNode;
  secondaryRecovery?: ReactNode;
  recovery?: string;
}) {
  const showStatus = status !== 'ready' || secondaryStatus;
  const showFallback = status === 'unavailable' || status === 'failed';

  return (
    <>
      {showStatus ? (
        <div className="artifact-viewport3d__status" aria-live="polite">
          {status !== 'ready' ? (
            <span className="artifact-viewport3d__status-badge" data-viewport-3d-status={status}>
              {label}
            </span>
          ) : null}
          {secondaryStatus ? (
            <span className="artifact-viewport3d__status-badge">
              {secondaryStatus}
              {secondaryRecovery ? (
                <span className="artifact-viewport3d__status-recovery">{secondaryRecovery}</span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
      {showFallback ? (
        <div className="artifact-viewport3d__fallback" data-viewport-3d-fallback>
          <strong>{label}</strong>
          <span>{recovery ?? 'The source frame stays available.'}</span>
        </div>
      ) : null}
    </>
  );
}

export function Viewport3DControlStrip({
  scope,
  locked,
  zoom,
  onToggleLocked,
  onReset,
  onOpenPreview,
}: {
  scope: 'camera' | 'scene';
  locked: boolean;
  zoom: number;
  onToggleLocked: (locked: boolean) => void;
  onReset: () => void;
  onOpenPreview?: () => void;
}) {
  const scopeLabel = scope === 'scene' ? 'scene' : 'camera';
  const controlLabel = scope === 'scene' ? 'scene camera' : 'camera';

  return (
    <div
      className="artifact-viewport3d__controls primitive-node-camera-strip nodrag nopan nowheel"
      data-primitive-camera-control
      data-viewport-3d-control-strip
    >
      <span className="artifact-viewport3d__control-status primitive-node-camera-hint" aria-live="polite">
        {locked ? `${scopeLabel} locked` : `${scopeLabel} ${Math.round(zoom * 100)}%`}
      </span>
      <div className="artifact-viewport3d__control-actions primitive-node-camera-actions">
        <Viewport3DButton
          active={locked}
          ariaLabel={locked ? `Unlock ${controlLabel}` : `Lock ${controlLabel}`}
          ariaPressed={locked}
          onClick={() => onToggleLocked(!locked)}
        >
          {locked ? `Unlock ${controlLabel}` : `Lock ${controlLabel}`}
        </Viewport3DButton>
        {onOpenPreview ? (
          <Viewport3DButton ariaLabel="Open preview" onClick={onOpenPreview}>
            Open preview
          </Viewport3DButton>
        ) : null}
        <Viewport3DButton ariaLabel={`Reset ${controlLabel}`} onClick={onReset}>
          Reset
        </Viewport3DButton>
      </div>
    </div>
  );
}

function Viewport3DButton({
  active = false,
  ariaLabel,
  ariaPressed,
  children,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
  ariaPressed?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <ToolbarButton
      className={`artifact-viewport3d__control primitive-camera-button${active ? ' primitive-camera-button-active' : ''}`}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </ToolbarButton>
  );
}
