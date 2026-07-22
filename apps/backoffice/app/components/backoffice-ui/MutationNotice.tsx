import { InlineNotice } from '@artifact/ui';

export function MutationNotice({ result }: { result: { ok: boolean; message: string; code?: string } | undefined }) {
  if (!result) return null;
  const view = mutationNoticeView(result);
  return (
    <InlineNotice className="mutation-notice" variant={view.variant}>
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
