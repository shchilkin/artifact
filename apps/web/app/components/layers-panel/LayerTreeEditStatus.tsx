import { EditorWorkflowNotice } from '../editor-workflow/EditorWorkflowNotice';
import type { LayerTreeEditStatus as LayerTreeEditStatusValue } from './useLayerTreeEditing';

/**
 * The Layers tree's edit feedback: what an edit did, or why it was blocked. It is the shared
 * `InlineNotice` (through `EditorWorkflowNotice`), laid over the bottom of the panel so a message
 * never shifts the rows, and it stays mounted while empty so its live region is registered before
 * the first message.
 */
export function LayerTreeEditStatus({ helpId, status }: { helpId: string; status: LayerTreeEditStatusValue | null }) {
  return (
    <>
      <p id={helpId} className="sr-only">
        Drag rows to move them. Alt+Up and Alt+Down move a row within its stack, and Delete removes it. Shift+F10 opens
        row actions, including Move to and Edit in Nodes.
      </p>
      <EditorWorkflowNotice
        className="layer-tree-edit-status"
        variant={status?.tone === 'blocked' ? 'warning' : 'info'}
        data-visible={status ? 'true' : 'false'}
      >
        {status?.message ?? ''}
      </EditorWorkflowNotice>
    </>
  );
}
