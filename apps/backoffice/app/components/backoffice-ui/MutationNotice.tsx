import { InlineNotice } from '@artifact/ui';
import { useEffect, useRef } from 'react';

export function MutationNotice({ result }: { result: { ok: boolean; message: string; code?: string } | undefined }) {
  const noticeRef = useRef<HTMLDivElement>(null);
  const hasRendered = useRef(false);

  useEffect(() => {
    if (hasRendered.current && result) {
      noticeRef.current?.focus();
    }
    hasRendered.current = true;
  }, [result]);

  if (!result) return null;
  const view = mutationNoticeView(result);
  return (
    <InlineNotice ref={noticeRef} className="mutation-notice" tabIndex={-1} variant={view.variant}>
      <strong>{view.title}</strong>
      <span>{result.message}</span>
    </InlineNotice>
  );
}

function mutationNoticeView(result: { ok: boolean; code?: string }) {
  if (result.ok) return { variant: 'success' as const, title: 'Change saved' };
  if (result.code === 'admin_state_conflict') {
    return { variant: 'danger' as const, title: 'Account changed elsewhere' };
  }
  return { variant: 'danger' as const, title: 'Change not saved' };
}
