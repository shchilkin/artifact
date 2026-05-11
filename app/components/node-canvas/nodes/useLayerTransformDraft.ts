import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Layer } from '../../../types/config';

export type TransformableLayer = Extract<Layer, { kind: 'text' | 'image' }>;
export type LayerTransformPatch = Partial<Pick<TransformableLayer, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'>>;

const WHEEL_SCALE_STEP = 0.002;
const WHEEL_COMMIT_DELAY = 180;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

function isTransformableLayer(layer: Layer): layer is TransformableLayer {
  return layer.kind === 'text' || layer.kind === 'image';
}

function clampScale(value: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}

function getTransform(layer: TransformableLayer): Required<LayerTransformPatch> {
  return {
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
  };
}

function sameTransform(layer: TransformableLayer, patch: LayerTransformPatch) {
  return (
    (patch.x === undefined || layer.x === patch.x) &&
    (patch.y === undefined || layer.y === patch.y) &&
    (patch.rotation === undefined || layer.rotation === patch.rotation) &&
    (patch.scaleX === undefined || layer.scaleX === patch.scaleX) &&
    (patch.scaleY === undefined || layer.scaleY === patch.scaleY)
  );
}

export function useLayerTransformDraft(layer: Layer, commitLayer: (id: string, patch: Partial<Layer>) => void) {
  const [draft, setDraft] = useState<LayerTransformPatch | null>(null);
  const draftRef = useRef<LayerTransformPatch | null>(null);
  const layerRef = useRef(layer);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    layerRef.current = layer;
    if (!isTransformableLayer(layer) || !draftRef.current) return;
    if (!sameTransform(layer, draftRef.current)) return;
    draftRef.current = null;
    setDraft(null);
  }, [layer]);

  useEffect(
    () => () => {
      clearTimeout(commitTimerRef.current);
      const currentLayer = layerRef.current;
      const currentDraft = draftRef.current;
      if (!currentDraft || !isTransformableLayer(currentLayer) || sameTransform(currentLayer, currentDraft)) return;
      commitLayer(currentLayer.id, currentDraft);
    },
    [commitLayer],
  );

  const commitDraft = useCallback(() => {
    clearTimeout(commitTimerRef.current);
    const currentLayer = layerRef.current;
    const currentDraft = draftRef.current;
    if (!currentDraft || !isTransformableLayer(currentLayer)) return;
    if (sameTransform(currentLayer, currentDraft)) {
      draftRef.current = null;
      setDraft(null);
      return;
    }
    commitLayer(currentLayer.id, currentDraft);
  }, [commitLayer]);

  const scheduleCommit = useCallback(() => {
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(commitDraft, WHEEL_COMMIT_DELAY);
  }, [commitDraft]);

  const updateDraft = useCallback(
    (patch: LayerTransformPatch, commit: 'manual' | 'defer' = 'manual') => {
      const currentLayer = layerRef.current;
      if (!isTransformableLayer(currentLayer)) return;
      const next = {
        ...(draftRef.current ?? getTransform(currentLayer)),
        ...patch,
      };
      draftRef.current = next;
      setDraft(next);
      if (commit === 'defer') scheduleCommit();
    },
    [scheduleCommit],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!isTransformableLayer(layerRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      const current = draftRef.current ?? getTransform(layerRef.current);
      const nextScale = clampScale(current.scaleX - event.deltaY * WHEEL_SCALE_STEP);
      updateDraft({ scaleX: nextScale, scaleY: nextScale }, 'defer');
    },
    [updateDraft],
  );

  const effectiveLayer = useMemo<Layer>(() => {
    if (!draft || !isTransformableLayer(layer)) return layer;
    return { ...layer, ...draft };
  }, [draft, layer]);

  return {
    effectiveLayer,
    isTransformable: isTransformableLayer(layer),
    updateDraft,
    commitDraft,
    handleWheel,
  };
}
