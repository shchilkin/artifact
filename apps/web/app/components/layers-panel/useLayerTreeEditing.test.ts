import { describe, expect, it } from 'vitest';
import { cloneDocument, DEFAULT_DOCUMENT } from '../../types/config';
import { type DocumentTreeEditStatus, settleTreeEditStatus } from './useLayerTreeEditing';

function status(overrides: Partial<DocumentTreeEditStatus>): DocumentTreeEditStatus {
  return { message: 'Deleted Badge.', tone: 'done', doc: DEFAULT_DOCUMENT, awaitsCommit: false, ...overrides };
}

describe('settleTreeEditStatus', () => {
  const before = DEFAULT_DOCUMENT;
  const edited = cloneDocument(DEFAULT_DOCUMENT);

  it('keeps a status while its document is rendered', () => {
    const current = status({ doc: before });
    expect(settleTreeEditStatus(current, before)).toBe(current);
  });

  it('moves a committing edit onto the next document, even when the committed document is a copy', () => {
    const committed = cloneDocument(edited);
    expect(settleTreeEditStatus(status({ doc: before, awaitsCommit: true }), committed)).toEqual(
      status({ doc: committed, awaitsCommit: false }),
    );
  });

  it('retires the status on any later document change, such as Undo back to the earlier document', () => {
    const afterEdit = status({ doc: edited });
    expect(settleTreeEditStatus(afterEdit, before)).toBeNull();
  });

  it('retires a blocked or move status when the document changes', () => {
    expect(settleTreeEditStatus(status({ tone: 'blocked', doc: before }), edited)).toBeNull();
  });

  it('has nothing to settle without a status', () => {
    expect(settleTreeEditStatus(null, before)).toBeNull();
  });
});
