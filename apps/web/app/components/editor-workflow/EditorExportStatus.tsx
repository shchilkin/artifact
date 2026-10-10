import { Button } from '@artifact/ui';

import type { EditorExportFeedback } from '../../hooks/useEditorExport';
import { EditorWorkflowNotice } from './EditorWorkflowNotice';
import './editor-workflow.css';

interface EditorExportStatusProps {
  feedback: EditorExportFeedback | null;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Export feedback laid over the workspace so it never shifts the canvas or the command bar.
 * The status region stays mounted while empty, so it is registered before the first file name is announced.
 */
export function EditorExportStatus({ feedback, onRetry, onDismiss }: EditorExportStatusProps) {
  const done = feedback?.tone === 'done' ? feedback : null;
  const error = feedback?.tone === 'error' ? feedback : null;

  return (
    <div className="editor-export-status">
      <EditorWorkflowNotice
        className="editor-export-status__notice"
        variant="success"
        role="status"
        data-visible={done ? 'true' : 'false'}
      >
        {done ? `Exported ${done.fileName}` : null}
      </EditorWorkflowNotice>
      {error ? (
        <EditorWorkflowNotice
          className="editor-export-status__notice"
          variant="danger"
          action={
            <>
              <Button size="compact" variant="secondary" onClick={onRetry}>
                Retry
              </Button>
              <Button size="compact" variant="quiet" onClick={onDismiss}>
                Dismiss
              </Button>
            </>
          }
        >
          {error.message}
        </EditorWorkflowNotice>
      ) : null}
    </div>
  );
}
