import { useCallback, useRef, useState } from 'react';

import { EditorConfirmDialog, type EditorConfirmRequest } from './EditorConfirmDialog';

interface PendingConfirm {
  request: EditorConfirmRequest;
  resolve: (confirmed: boolean) => void;
}

/** Promise-based confirmation: `await confirm(request)` resolves true only when the person confirms. */
export function useEditorConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  const confirm = useCallback(
    (request: EditorConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        // A newer request replaces an unanswered one; the older caller sees a cancel.
        pendingRef.current?.resolve(false);
        const next = { request, resolve };
        pendingRef.current = next;
        setPending(next);
      }),
    [],
  );

  const confirmDialog = pending ? (
    <EditorConfirmDialog open {...pending.request} onCancel={() => settle(false)} onConfirm={() => settle(true)} />
  ) : null;

  return { confirm, confirmDialog };
}
