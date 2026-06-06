import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Layer } from '../../../types/config';

export type TransformableLayer = Extract<Layer, { kind: 'text' | 'image' }>;
export type LayerTransformPatch = Partial<Pick<TransformableLayer, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'>>;

const WHEEL_SCALE_STEP = 0.0016;
const WHEEL_COMMIT_DELAY = 90;
const DRAFT_SETTLE_DELAY = 180;
const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
const TRANSFORM_FIELDS = ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const;

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
  return TRANSFORM_FIELDS.every((field) => patch[field] === undefined || layer[field] === patch[field]);
}

function samePatch(a: LayerTransformPatch | null, b: LayerTransformPatch | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return TRANSFORM_FIELDS.every((field) => a[field] === b[field]);
}

function shouldClearSettledDraft(
  layer: Layer,
  currentDraft: LayerTransformPatch | null,
  matchingDraft: LayerTransformPatch,
) {
  if (!isTransformableLayer(layer)) return false;
  if (!currentDraft) return false;
  if (!samePatch(currentDraft, matchingDraft)) return false;
  return sameTransform(layer, currentDraft);
}

function shouldCommitDraftOnCleanup(layer: Layer, currentDraft: LayerTransformPatch | null) {
  if (!isTransformableLayer(layer)) return false;
  if (!currentDraft) return false;
  return !sameTransform(layer, currentDraft);
}

function nextTransformDraft(layer: Layer, currentDraft: LayerTransformPatch | null, patch: LayerTransformPatch) {
  if (!isTransformableLayer(layer)) return null;
  const next = {
    ...(currentDraft ?? getTransform(layer)),
    ...patch,
  };
  return samePatch(currentDraft, next) ? null : next;
}

function cancelDraftFrame(frameId: number | null) {
  if (frameId !== null) cancelAnimationFrame(frameId);
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
      if (!shouldClearSettledDraft(currentLayer, draftRef.current, matchingDraft)) return;
      draftRef.current = null;
      pendingDraftRef.current = null;
      setDraft(null);
    }, DRAFT_SETTLE_DELAY);
  }, [layer]);

  useEffect(
    () => () => {
      clearTimeout(commitTimerRef.current);
      clearTimeout(clearDraftTimerRef.current);
      cancelDraftFrame(draftFrameRef.current);
      const currentLayer = layerRef.current;
      const currentDraft = draftRef.current;
      if (!shouldCommitDraftOnCleanup(currentLayer, currentDraft)) return;
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
      const next = nextTransformDraft(layerRef.current, draftRef.current, patch);
      if (!next) return;
      draftRef.current = next;
      pendingDraftRef.current = next;
      draftFrameRef.current = scheduleDraftFrame(draftFrameRef.current, () => {
        draftFrameRef.current = null;
        commitPendingDraft(pendingDraftRef.current, setDraft);
        pendingDraftRef.current = null;
      });
      scheduleDeferredTransformCommit(commit, scheduleCommit);
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

function scheduleDraftFrame(currentFrame: number | null, callback: () => void) {
  return currentFrame ?? requestAnimationFrame(callback);
}

function commitPendingDraft(
  pending: LayerTransformPatch | null,
  setDraft: (updater: (current: LayerTransformPatch | null) => LayerTransformPatch | null) => void,
) {
  if (!pending) return;
  setDraft((current) => (samePatch(current, pending) ? current : pending));
}

function scheduleDeferredTransformCommit(commit: 'manual' | 'defer', scheduleCommit: () => void) {
  if (commit === 'defer') scheduleCommit();
}
