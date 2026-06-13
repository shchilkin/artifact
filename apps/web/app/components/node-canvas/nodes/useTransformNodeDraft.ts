import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GraphTransformNode } from '../../../types/config';

export type TransformNodePatch = Partial<Pick<GraphTransformNode, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'>>;

const WHEEL_SCALE_STEP = 0.16;
const WHEEL_COMMIT_DELAY = 90;
const DRAFT_SETTLE_DELAY = 180;
const MIN_POSITION = -240;
const MAX_POSITION = 240;
const MIN_SCALE = 1;
const MAX_SCALE = 500;
const TRANSFORM_FIELDS = ['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const;

function clampPosition(value: number) {
  return Math.max(MIN_POSITION, Math.min(MAX_POSITION, value));
}

function clampScale(value: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}

function getTransform(node: GraphTransformNode): Required<TransformNodePatch> {
  return {
    x: node.x,
    y: node.y,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    rotation: node.rotation,
  };
}

function sameTransform(node: GraphTransformNode, patch: TransformNodePatch) {
  return TRANSFORM_FIELDS.every((field) => patch[field] === undefined || node[field] === patch[field]);
}

function samePatch(a: TransformNodePatch | null, b: TransformNodePatch | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return TRANSFORM_FIELDS.every((field) => a[field] === b[field]);
}

function nextTransformDraft(
  node: GraphTransformNode,
  currentDraft: TransformNodePatch | null,
  patch: TransformNodePatch,
) {
  const next = {
    ...(currentDraft ?? getTransform(node)),
    ...patch,
  };
  next.x = clampPosition(next.x);
  next.y = clampPosition(next.y);
  next.scaleX = clampScale(next.scaleX);
  next.scaleY = clampScale(next.scaleY);
  return samePatch(currentDraft, next) ? null : next;
}

function cancelDraftFrame(frameId: number | null) {
  if (frameId !== null) cancelAnimationFrame(frameId);
}

export function useTransformNodeDraft(
  transformNode: GraphTransformNode,
  commitTransformNode: (id: string, patch: Partial<GraphTransformNode>) => void,
) {
  const [draft, setDraft] = useState<TransformNodePatch | null>(null);
  const draftRef = useRef<TransformNodePatch | null>(null);
  const pendingDraftRef = useRef<TransformNodePatch | null>(null);
  const draftFrameRef = useRef<number | null>(null);
  const nodeRef = useRef(transformNode);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const clearDraftTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const flushPendingDraft = useCallback(() => {
    cancelDraftFrame(draftFrameRef.current);
    draftFrameRef.current = null;
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (pending) setDraft((current) => (samePatch(current, pending) ? current : pending));
  }, []);

  useEffect(() => {
    nodeRef.current = transformNode;
    clearTimeout(clearDraftTimerRef.current);
    if (!draftRef.current || !sameTransform(transformNode, draftRef.current)) return;

    const matchingDraft = draftRef.current;
    clearDraftTimerRef.current = setTimeout(() => {
      if (!draftRef.current || !samePatch(draftRef.current, matchingDraft)) return;
      if (!sameTransform(nodeRef.current, draftRef.current)) return;
      draftRef.current = null;
      pendingDraftRef.current = null;
      setDraft(null);
    }, DRAFT_SETTLE_DELAY);
  }, [transformNode]);

  useEffect(
    () => () => {
      clearTimeout(commitTimerRef.current);
      clearTimeout(clearDraftTimerRef.current);
      cancelDraftFrame(draftFrameRef.current);
      const currentDraft = draftRef.current;
      if (!currentDraft || sameTransform(nodeRef.current, currentDraft)) return;
      commitTransformNode(nodeRef.current.id, currentDraft);
    },
    [commitTransformNode],
  );

  const commitDraft = useCallback(() => {
    clearTimeout(commitTimerRef.current);
    flushPendingDraft();
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    if (sameTransform(nodeRef.current, currentDraft)) {
      draftRef.current = null;
      pendingDraftRef.current = null;
      setDraft(null);
      return;
    }
    commitTransformNode(nodeRef.current.id, currentDraft);
  }, [commitTransformNode, flushPendingDraft]);

  const scheduleCommit = useCallback(() => {
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(commitDraft, WHEEL_COMMIT_DELAY);
  }, [commitDraft]);

  const updateDraft = useCallback(
    (patch: TransformNodePatch, commit: 'manual' | 'defer' = 'manual') => {
      const next = nextTransformDraft(nodeRef.current, draftRef.current, patch);
      if (!next) return;
      draftRef.current = next;
      pendingDraftRef.current = next;
      draftFrameRef.current =
        draftFrameRef.current ??
        requestAnimationFrame(() => {
          draftFrameRef.current = null;
          const pending = pendingDraftRef.current;
          pendingDraftRef.current = null;
          if (pending) setDraft((current) => (samePatch(current, pending) ? current : pending));
        });
      if (commit === 'defer') scheduleCommit();
    },
    [scheduleCommit],
  );

  const handleWheelDelta = useCallback(
    (deltaY: number) => {
      const current = draftRef.current ?? getTransform(nodeRef.current);
      const nextScaleX = clampScale(current.scaleX - deltaY * WHEEL_SCALE_STEP);
      if (nodeRef.current.uniformScale) {
        updateDraft({ scaleX: nextScaleX, scaleY: nextScaleX }, 'defer');
        return;
      }
      const ratio = current.scaleX === 0 ? 1 : nextScaleX / current.scaleX;
      updateDraft({ scaleX: nextScaleX, scaleY: clampScale(current.scaleY * ratio) }, 'defer');
    },
    [updateDraft],
  );

  const effectiveTransformNode = useMemo<GraphTransformNode>(() => {
    if (!draft) return transformNode;
    return { ...transformNode, ...draft };
  }, [draft, transformNode]);

  return {
    effectiveTransformNode,
    hasDraft: Boolean(draft),
    updateDraft,
    commitDraft,
    handleWheelDelta,
  };
}
