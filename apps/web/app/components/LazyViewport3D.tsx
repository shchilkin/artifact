import { lazy, Suspense } from 'react';

import type { ModelViewport3DProps } from './ModelViewport3D';
import type { PrimitiveViewport3DProps } from './PrimitiveViewport3D';

import './canvas-chrome/viewport-3d-chrome.css';

const PrimitiveViewport3D = lazy(() =>
  import('./PrimitiveViewport3D').then((module) => ({
    default: module.PrimitiveViewport3D,
  })),
);

const ModelViewport3D = lazy(() =>
  import('./ModelViewport3D').then((module) => ({
    default: module.ModelViewport3D,
  })),
);

function viewportFallback(className: string | undefined) {
  return (
    <div
      className={[
        'artifact-viewport3d',
        'artifact-viewport3d--loading',
        'artifact-viewport3d--passive',
        'node-primitive-preview',
        'node-primitive-preview-transparent',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-viewport-3d-state="loading"
      aria-hidden="true"
    />
  );
}

export function LazyPrimitiveViewport3D(props: PrimitiveViewport3DProps) {
  return (
    <Suspense fallback={viewportFallback(props.className)}>
      <PrimitiveViewport3D {...props} />
    </Suspense>
  );
}

export function LazyModelViewport3D(props: ModelViewport3DProps) {
  return (
    <Suspense fallback={viewportFallback(props.className)}>
      <ModelViewport3D {...props} />
    </Suspense>
  );
}
