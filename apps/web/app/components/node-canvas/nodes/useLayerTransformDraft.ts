import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Layer } from '../../../types/config';

export type TransformableLayer = Extract<Layer, { kind: 'text' | 'image' }>;
export type LayerTransformPatch = Partial<Pick<TransformableLayer, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'>>;

const WHEEL_SCALE_STEP = 0.0016;
const WHEEL_COMMIT_DELAY = 90;
const DRAFT_SETTLE_DELAY = 180;
const MIN_SCALE = 0.05;
const MAX_SCALE = 5;

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

function samePatch(a: LayerTransformPatch | null, b: LayerTransformPatch | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.rotation === b.rotation && a.scaleX === b.scaleX && a.scaleY === b.scaleY;
}

export function useLayerTransformDraft(layer: Layer, commitLayer: (id: string, patch: Partial<Layer>) => void) {
  const [draft, setDraft] = useState<LayerTransformPatch | null>(null);
  const draftRef = useRef<LayerTransformPatch | null>(null);
  const pendingDraftRef = useRef<LayerTransformPatch | null>(null);
  const draftFrameRef = useRef<number | null>(null);
  const layerRef = useRef(layer);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const clearDraftTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const flushPendingDraft = useCallback(() => {
    if (draftFrameRef.current !== null) {
      cancelAnimationFrame(draftFrameRef.current);
      draftFrameRef.current = null;
    }
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (pending) setDraft((current) => (samePatch(current, pending) ? current : pending));
  }, []);

  useEffect(() => {
    layerRef.current = layer;
    clearTimeout(clearDraftTimerRef.current);
    if (!isTransformableLayer(layer) || !draftRef.current) return;
    if (!sameTransform(layer, draftRef.current)) return;

    const matchingDraft = draftRef.current;
    clearDraftTimerRef.current = setTimeout(() => {
      const currentLayer = layerRef.current;
      if (!isTransformableLayer(currentLayer) || !draftRef.current) return;
      if (!samePatch(draftRef.current, matchingDraft) || !sameTransform(currentLayer, draftRef.current)) return;
      draftRef.current = null;
      pendingDraftRef.current = null;
      setDraft(null);
    }, DRAFT_SETTLE_DELAY);
  }, [layer]);

  useEffect(
    () => () => {
      clearTimeout(commitTimerRef.current);
      clearTimeout(clearDraftTimerRef.current);
      if (draftFrameRef.current !== null) cancelAnimationFrame(draftFrameRef.current);
      const currentLayer = layerRef.current;
      const currentDraft = draftRef.current;
      if (!currentDraft || !isTransformableLayer(currentLayer) || sameTransform(currentLayer, currentDraft)) return;
      commitLayer(currentLayer.id, currentDraft);
    },
    [commitLayer],
  );

  const commitDraft = useCallback(() => {
    clearTimeout(commitTimerRef.current);
    flushPendingDraft();
    const currentLayer = layerRef.current;
    const currentDraft = draftRef.current;
    if (!currentDraft || !isTransformableLayer(currentLayer)) return;
    if (sameTransform(currentLayer, currentDraft)) {
      draftRef.current = null;
      pendingDraftRef.current = null;
      setDraft(null);
      return;
    }
    commitLayer(currentLayer.id, currentDraft);
  }, [commitLayer, flushPendingDraft]);

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
      if (samePatch(draftRef.current, next)) return;
      draftRef.current = next;
      pendingDraftRef.current = next;
      if (draftFrameRef.current === null) {
        draftFrameRef.current = requestAnimationFrame(() => {
          draftFrameRef.current = null;
          const pending = pendingDraftRef.current;
          pendingDraftRef.current = null;
          if (pending) setDraft((current) => (samePatch(current, pending) ? current : pending));
        });
      }
      if (commit === 'defer') scheduleCommit();
    },
    [scheduleCommit],
  );

  const handleWheelDelta = useCallback(
    (deltaY: number) => {
      if (!isTransformableLayer(layerRef.current)) return;
      const current = draftRef.current ?? getTransform(layerRef.current);
      const nextScale = clampScale(current.scaleX - deltaY * WHEEL_SCALE_STEP);
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
    hasDraft: Boolean(draft),
    isTransformable: isTransformableLayer(layer),
    updateDraft,
    commitDraft,
    handleWheelDelta,
  };
}
