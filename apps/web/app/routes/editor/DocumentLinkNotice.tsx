import { IconButton } from '@artifact/ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { EditorWorkflowNotice } from '../../components/editor-workflow/EditorWorkflowNotice';
import type { DocumentLinkStatus } from '../../utils/documentPersistence';

/** Says where the opening document came from, or that a `?doc` link couldn't be read. Overlays the stage, so it causes no layout shift. */
export function DocumentLinkNotice({ status }: { status: DocumentLinkStatus }) {
  const [dismissed, setDismissed] = useState(false);
  if (status.kind === 'none' || dismissed) return null;

  const unreadable = status.kind === 'unreadable';
  return (
    <EditorWorkflowNotice
      className="editor-workflow-notice--link"
      variant={unreadable ? 'danger' : 'info'}
      action={
        <IconButton
          label="Dismiss link notice"
          icon={<span aria-hidden="true">×</span>}
          onClick={() => setDismissed(true)}
        />
      }
    >
      {status.kind === 'unreadable' ? (
        <span>
          This link's document couldn't be read.{' '}
          {status.fallback === 'stored' ? 'Showing your last canvas.' : 'Showing the default canvas.'}
        </span>
      ) : status.source === 'docs' ? (
        <span>
          Loaded from <Link to="/docs/nodes">docs</Link>. Customize or randomize to make it yours.
        </span>
      ) : (
        <span>Opened from link.</span>
      )}
    </EditorWorkflowNotice>
  );
}
