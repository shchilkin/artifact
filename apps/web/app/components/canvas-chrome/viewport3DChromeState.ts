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
