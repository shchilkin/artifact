import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CanvasDocument } from '../../types/config';
import { canDeleteNodeFromDocument } from '../../utils/editorGuardrails';
import type { GraphLayerTree } from '../../utils/graphLayerTree';
import {
  buildGraphTreeEditIndex,
  checkTreeInsertAbove,
  checkTreeMove,
  checkTreeRowMovable,
  deleteTreeNodes,
  graphNodeConsumerCount,
  type LayerAddPlacement,
  moveTreeRow,
  stepTreeRow,
  type TreeDropPosition,
  type TreeEditResult,
  treeRowStepTarget,
} from '../../utils/graphTreeEdits';
import { useEditorConfirm } from '../editor-workflow/useEditorConfirm';
import type { GraphLayerTreeEditing } from './GraphLayerTreeView';
import type { LayerContextMenuState, LayerTreeMenuItem } from './LayerContextMenu';

// Edits in the Layers tree (docs/layers-graph-tree.md, "Editing in the tree"): moves, keyboard move
// mode, delete with a confirm for shared nodes, "Edit in Nodes", Add placement, and announcements.

const STATUS_CLEAR_MS = 6000;

type ApplyTreeEdit = (edit: (doc: CanvasDocument) => TreeEditResult) => TreeEditResult;

export function useLayerTreeEditing({
  doc,
  tree,
  selectedLayerId,
  onApplyTreeEdit,
  onEditInNodes,
  onSelectLayer,
  onOpenNodeContextMenu,
}: {
  doc: CanvasDocument;
  tree: GraphLayerTree | null;
  selectedLayerId: string | null;
  onApplyTreeEdit?: ApplyTreeEdit;
  onEditInNodes?: (nodeId: string) => void;
  onSelectLayer: (id: string | null) => void;
  onOpenNodeContextMenu: (state: LayerContextMenuState) => void;
}) {
  const helpId = useId();
  const { confirm, confirmDialog } = useEditorConfirm();
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; serial: number }>({ message: '', serial: 0 });
  const docRef = useRef(doc);
  useLayoutEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const index = useMemo(
    () => (tree && onApplyTreeEdit ? buildGraphTreeEditIndex(doc, tree) : null),
    [doc, onApplyTreeEdit, tree],
  );

  useEffect(() => {
    if (!status.message) return;
    const timer = window.setTimeout(() => setStatus((current) => ({ ...current, message: '' })), STATUS_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const announce = useCallback((message: string) => {
    setStatus((current) => ({ message, serial: current.serial + 1 }));
  }, []);

  const nameOf = useCallback(
    (nodeId: string) => index?.places.get(nodeId)?.row.name ?? doc.layers.find((layer) => layer.id === nodeId)?.name,
    [doc.layers, index],
  );

  /** Applies an edit and announces the outcome. Returns the edited document, or null when blocked. */
  const apply = useCallback(
    (edit: (current: CanvasDocument) => TreeEditResult, success: string) => {
      if (!onApplyTreeEdit) return null;
      const result = onApplyTreeEdit(edit);
      announce(result.ok ? success : result.reason);
      return result.ok ? result.doc : null;
    },
    [announce, onApplyTreeEdit],
  );

  const moveRow = useCallback(
    (nodeId: string, targetId: string, position: TreeDropPosition) => {
      setMovingNodeId(null);
      return apply(
        (current) => moveTreeRow(current, nodeId, targetId, position),
        `Moved ${nameOf(nodeId)} ${position} ${nameOf(targetId)}.`,
      );
    },
    [apply, nameOf],
  );

  const stepRow = useCallback(
    (nodeId: string, direction: 'up' | 'down') =>
      apply((current) => stepTreeRow(current, nodeId, direction), `Moved ${nameOf(nodeId)} ${direction}.`),
    [apply, nameOf],
  );

  const deleteRows = useCallback(
    async (nodeIds: string[]) => {
      const current = docRef.current;
      const deletable = nodeIds.filter((id) => canDeleteNodeFromDocument(current, id));
      if (deletable.length === 0) {
        announce('Locked layers can’t be deleted. Unlock them first.');
        return;
      }
      const names = deletable.map((id) => nameOf(id) ?? id).join(', ');
      const shared = deletable.filter((id) => graphNodeConsumerCount(current, id) > 1);
      if (shared.length > 0) {
        const sharedNames = shared.map((id) => nameOf(id) ?? id).join(', ');
        const confirmed = await confirm({
          title: shared.length === 1 ? `Delete shared ${sharedNames}?` : 'Delete shared nodes?',
          description: `${sharedNames} ${shared.length === 1 ? 'is' : 'are'} used in more than one place. Deleting changes every place that uses ${shared.length === 1 ? 'it' : 'them'}.`,
          confirmLabel: 'Delete',
          tone: 'danger',
        });
        if (!confirmed) return;
      }
      setMovingNodeId(null);
      const applied = apply((latest) => ({ ok: true, doc: deleteTreeNodes(latest, deletable) }), `Deleted ${names}.`);
      if (applied && selectedLayerId && deletable.includes(selectedLayerId)) onSelectLayer(null);
    },
    [announce, apply, confirm, nameOf, onSelectLayer, selectedLayerId],
  );

  const startMove = useCallback(
    (nodeId: string) => {
      setMovingNodeId(nodeId);
      announce(
        `Moving ${nameOf(nodeId)}. Go to a row, then press Enter to place it above or Shift+Enter to place it below. Press Escape to cancel.`,
      );
    },
    [announce, nameOf],
  );

  const cancelMove = useCallback(() => {
    setMovingNodeId(null);
    announce('Move cancelled.');
  }, [announce]);

  const openNodeContextMenuAt = useCallback<GraphLayerTreeEditing['onOpenNodeContextMenuAt']>(
    (nodeId, position, returnFocusTarget, reference) => {
      onSelectLayer(nodeId);
      onOpenNodeContextMenu({ ...position, ids: [nodeId], returnFocusTarget, reference });
    },
    [onOpenNodeContextMenu, onSelectLayer],
  );

  const editing = useMemo<GraphLayerTreeEditing | undefined>(
    () =>
      index
        ? {
            index,
            helpId,
            movingNodeId,
            onMoveRow: moveRow,
            onStepRow: stepRow,
            onDeleteRows: (ids) => void deleteRows(ids),
            onCancelMove: cancelMove,
            onBlocked: announce,
            onOpenNodeContextMenuAt: openNodeContextMenuAt,
          }
        : undefined,
    [announce, cancelMove, deleteRows, helpId, index, movingNodeId, moveRow, openNodeContextMenuAt, stepRow],
  );

  /** Tree actions for a row's context menu: moves, Edit in Nodes, and Delete for graph-only nodes. */
  const menuItems = useCallback(
    (menu: LayerContextMenuState | null): LayerTreeMenuItem[] => {
      if (!index || !menu || menu.ids.length !== 1) return [];
      const [nodeId] = menu.ids;
      const items: LayerTreeMenuItem[] = [];
      if (!menu.reference && index.places.has(nodeId)) {
        for (const direction of ['up', 'down'] as const) {
          const step = treeRowStepTarget(index, nodeId, direction);
          const check = 'ok' in step ? step : checkTreeMove(index, nodeId, step.targetId, step.position);
          const blockedReason = check.ok ? undefined : check.reason;
          items.push({
            label: direction === 'up' ? 'Move up' : 'Move down',
            blockedReason,
            onSelect: () => (blockedReason ? announce(blockedReason) : stepRow(nodeId, direction)),
          });
        }
        const movable = checkTreeRowMovable(index, nodeId);
        const moveReason = movable.ok ? undefined : movable.reason;
        items.push({
          label: 'Move to…',
          blockedReason: moveReason,
          onSelect: () => (moveReason ? announce(moveReason) : startMove(nodeId)),
        });
      }
      if (onEditInNodes) items.push({ label: 'Edit in Nodes', keepFocus: true, onSelect: () => onEditInNodes(nodeId) });
      const isLayer = doc.layers.some((layer) => layer.id === nodeId);
      if (!menu.reference && !isLayer) {
        items.push({ label: 'Delete', variant: 'danger', keepFocus: true, onSelect: () => void deleteRows([nodeId]) });
      }
      return items;
    },
    [announce, deleteRows, doc.layers, index, onEditInNodes, startMove, stepRow],
  );

  /** Add goes above the selected tree row when that row has a gap above it. */
  const addPlacement = useMemo<LayerAddPlacement | undefined>(
    () =>
      index && selectedLayerId && checkTreeInsertAbove(index, selectedLayerId).ok
        ? { aboveNodeId: selectedLayerId }
        : undefined,
    [index, selectedLayerId],
  );

  return {
    editing,
    menuItems,
    deleteRows,
    addPlacement,
    helpId,
    status,
    confirmDialog,
  };
}
