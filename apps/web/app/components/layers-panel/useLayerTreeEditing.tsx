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
  graphNodeHasSourceBelow,
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

/**
 * A status and the document it describes. `awaitsCommit` marks a tree edit whose document has not
 * rendered yet: the next document change is that edit and the status moves onto it. Any other
 * document change, such as Undo, Redo or an inspector edit, retires the status. This does not rely
 * on the committed document being the same object as `TreeEditResult.doc`.
 */
export interface DocumentTreeEditStatus extends LayerTreeEditStatus {
  doc: CanvasDocument;
  awaitsCommit: boolean;
}

/** The status to show with the rendered document `doc`; see `DocumentTreeEditStatus`. */
export function settleTreeEditStatus(
  status: DocumentTreeEditStatus | null,
  doc: CanvasDocument,
): DocumentTreeEditStatus | null {
  if (!status || status.doc === doc) return status;
  return status.awaitsCommit ? { ...status, doc, awaitsCommit: false } : null;
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
    (message: string, tone: LayerTreeEditStatus['tone'] = 'done', awaitsCommit = false) => {
      setStatus({ message, tone, doc, awaitsCommit });
    },
    [doc],
  );
  const announceBlocked = useCallback((reason: string) => announce(reason, 'blocked'), [announce]);
  // Settled during render, so a stale message never shows and a Redo back to the same document
  // can't revive it.
  const settled = settleTreeEditStatus(status, doc);
  if (settled !== status) setStatus(settled);
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
      if (result.ok) announce(success, 'done', result.doc !== doc);
      else announceBlocked(result.reason);
      return result.ok ? result.doc : null;
    },
    [announce, announceBlocked, doc, onApplyTreeEdit],
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
          description: sharedDeleteDescription(doc, shared, sharedNames),
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

/** Plain copy for deleting shared nodes: where they are used, what each place gets instead, and that it can be undone. */
function sharedDeleteDescription(doc: CanvasDocument, shared: string[], sharedNames: string) {
  const withSource = shared.filter((id) => graphNodeHasSourceBelow(doc, id)).length;
  if (shared.length === 1) {
    const effect = withSource ? 'reconnects each place to the layer below it' : 'leaves those inputs empty';
    return `${sharedNames} is used in ${graphNodeConsumerCount(doc, shared[0])} places. Deleting it ${effect}. You can undo this.`;
  }
  const effect =
    withSource === shared.length
      ? 'reconnects each place to the layer below it'
      : withSource === 0
        ? 'leaves those inputs empty'
        : 'reconnects each place to the layer below it, or leaves the input empty where there is none';
  return `${sharedNames} are each used in more than one place. Deleting them ${effect}. You can undo this.`;
}
