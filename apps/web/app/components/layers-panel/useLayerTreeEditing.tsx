import { useCallback, useEffect, useId, useMemo, useState } from 'react';
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
import type { GraphLayerTreeEditActions, GraphLayerTreeEditing } from './graphLayerTreeEditing';
import type { LayerContextMenuState, LayerTreeMenuItem } from './LayerContextMenu';

// Edits in the Layers tree (docs/layers-graph-tree.md, "Editing in the tree"): moves, keyboard move
// mode, delete with a confirm for shared nodes, "Edit in Nodes", Add placement, and announcements.

const STATUS_CLEAR_MS = 6000;

type ApplyTreeEdit = (edit: (doc: CanvasDocument) => TreeEditResult) => TreeEditResult;

/** The latest edit outcome. `blocked` messages say why an edit did not happen. */
export interface LayerTreeEditStatus {
  message: string;
  tone: 'done' | 'blocked';
}

/** A status and the document it describes. Any other document change, such as Undo, retires it. */
interface DocumentTreeEditStatus extends LayerTreeEditStatus {
  doc: CanvasDocument;
}

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
  const [status, setStatus] = useState<DocumentTreeEditStatus | null>(null);

  const index = useMemo(
    () => (tree && onApplyTreeEdit ? buildGraphTreeEditIndex(doc, tree) : null),
    [doc, onApplyTreeEdit, tree],
  );

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), STATUS_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const announce = useCallback(
    (message: string, tone: LayerTreeEditStatus['tone'] = 'done', about: CanvasDocument = doc) => {
      setStatus({ message, tone, doc: about });
    },
    [doc],
  );
  const announceBlocked = useCallback((reason: string) => announce(reason, 'blocked'), [announce]);
  // A history step outside the tree (Undo, Redo, an inspector edit) makes the last tree message stale.
  // It is dropped during render, so it never shows and a Redo back to the same document can't revive it.
  if (status && status.doc !== doc) setStatus(null);
  const visibleStatus = useMemo<LayerTreeEditStatus | null>(
    () => (status ? { message: status.message, tone: status.tone } : null),
    [status],
  );

  const nameOf = useCallback(
    (nodeId: string) => index?.places.get(nodeId)?.row.name ?? doc.layers.find((layer) => layer.id === nodeId)?.name,
    [doc.layers, index],
  );

  /** Applies an edit and announces the outcome. Returns the edited document, or null when blocked. */
  const apply = useCallback(
    (edit: (current: CanvasDocument) => TreeEditResult, success: string) => {
      if (!onApplyTreeEdit) return null;
      const result = onApplyTreeEdit(edit);
      if (result.ok) announce(success, 'done', result.doc);
      else announceBlocked(result.reason);
      return result.ok ? result.doc : null;
    },
    [announce, announceBlocked, onApplyTreeEdit],
  );

  const move = useCallback(
    (nodeId: string, targetId: string, position: TreeDropPosition) => {
      setMovingNodeId(null);
      return apply(
        (current) => moveTreeRow(current, nodeId, targetId, position),
        `Moved ${nameOf(nodeId)} ${position} ${nameOf(targetId)}.`,
      );
    },
    [apply, nameOf],
  );

  const step = useCallback(
    (nodeId: string, direction: 'up' | 'down') =>
      apply((current) => stepTreeRow(current, nodeId, direction), `Moved ${nameOf(nodeId)} ${direction}.`),
    [apply, nameOf],
  );

  // Reads the document this render shows; the edit itself runs on the latest document.
  const deleteRows = useCallback(
    async (nodeIds: string[]) => {
      const deletable = nodeIds.filter((id) => canDeleteNodeFromDocument(doc, id));
      if (deletable.length === 0) {
        announceBlocked('Locked layers can’t be deleted. Unlock them first.');
        return;
      }
      const names = deletable.map((id) => nameOf(id) ?? id).join(', ');
      const shared = deletable.filter((id) => graphNodeConsumerCount(doc, id) > 1);
      if (shared.length > 0) {
        const sharedNames = shared.map((id) => nameOf(id) ?? id).join(', ');
        const one = shared.length === 1;
        const confirmed = await confirm({
          title: one ? `Delete shared ${sharedNames}?` : 'Delete shared nodes?',
          description: `${sharedNames} ${one ? 'is' : 'are'} used in more than one place. Each of those places will use what was under ${one ? 'it' : 'them'} instead, so that source becomes shared.`,
          confirmLabel: 'Delete',
          tone: 'danger',
        });
        if (!confirmed) return;
      }
      setMovingNodeId(null);
      const edited = apply((latest) => ({ ok: true, doc: deleteTreeNodes(latest, deletable) }), `Deleted ${names}.`);
      if (edited && selectedLayerId && deletable.includes(selectedLayerId)) onSelectLayer(null);
    },
    [announceBlocked, apply, confirm, doc, nameOf, onSelectLayer, selectedLayerId],
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

  const openNodeMenu = useCallback<GraphLayerTreeEditActions['openNodeMenu']>(
    (nodeId, position, returnFocusTarget, reference) => {
      onSelectLayer(nodeId);
      onOpenNodeContextMenu({ ...position, ids: [nodeId], returnFocusTarget, reference });
    },
    [onOpenNodeContextMenu, onSelectLayer],
  );

  const actions = useMemo<GraphLayerTreeEditActions>(
    () => ({
      move,
      step,
      deleteRows: (ids) => void deleteRows(ids),
      cancelMove,
      announceBlocked,
      openNodeMenu,
    }),
    [announceBlocked, cancelMove, deleteRows, move, openNodeMenu, step],
  );

  const editing = useMemo<GraphLayerTreeEditing | null>(
    () => (index ? { index, helpId, movingNodeId, actions } : null),
    [actions, helpId, index, movingNodeId],
  );

  /** Tree actions for a row's context menu: moves, Edit in Nodes, and Delete for graph-only nodes. */
  const menuItems = useCallback(
    (menu: LayerContextMenuState | null): LayerTreeMenuItem[] => {
      if (!index || !menu || menu.ids.length !== 1) return [];
      const [nodeId] = menu.ids;
      const items: LayerTreeMenuItem[] = [];
      if (!menu.reference && index.places.has(nodeId)) {
        for (const direction of ['up', 'down'] as const) {
          const target = treeRowStepTarget(index, nodeId, direction);
          const check = 'ok' in target ? target : checkTreeMove(index, nodeId, target.targetId, target.position);
          const blockedReason = check.ok ? undefined : check.reason;
          items.push({
            label: direction === 'up' ? 'Move up' : 'Move down',
            blockedReason,
            onSelect: () => (blockedReason ? announceBlocked(blockedReason) : step(nodeId, direction)),
          });
        }
        const movable = checkTreeRowMovable(index, nodeId);
        const moveReason = movable.ok ? undefined : movable.reason;
        items.push({
          label: 'Move to…',
          blockedReason: moveReason,
          onSelect: () => (moveReason ? announceBlocked(moveReason) : startMove(nodeId)),
        });
      }
      if (onEditInNodes) items.push({ label: 'Edit in Nodes', keepFocus: true, onSelect: () => onEditInNodes(nodeId) });
      const isLayer = doc.layers.some((layer) => layer.id === nodeId);
      if (!menu.reference && !isLayer) {
        items.push({ label: 'Delete', variant: 'danger', keepFocus: true, onSelect: () => void deleteRows([nodeId]) });
      }
      return items;
    },
    [announceBlocked, deleteRows, doc.layers, index, onEditInNodes, startMove, step],
  );

  /** Add goes above the selected tree row when that row has a gap above it. */
  const addPlacement = useMemo<LayerAddPlacement | undefined>(
    () =>
      index && selectedLayerId && checkTreeInsertAbove(index, selectedLayerId).ok
        ? { aboveNodeId: selectedLayerId }
        : undefined,
    [index, selectedLayerId],
  );

  return { editing, menuItems, deleteRows, addPlacement, helpId, status: visibleStatus, confirmDialog };
}
