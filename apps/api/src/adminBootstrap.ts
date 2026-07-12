import { randomUUID } from 'node:crypto';
import type { ApiRepositories } from './db/repositories.js';

export async function bootstrapFirstAdmin(input: {
  repositories: ApiRepositories;
  userId: string;
  confirmedUserId: string;
  confirmed: boolean;
  createId?: () => string;
}) {
  const userId = input.userId.trim();
  if (!userId || userId !== input.confirmedUserId.trim()) {
    throw new Error('Admin bootstrap confirmation must exactly match the account ID.');
  }
  if (!input.confirmed) throw new Error('Admin bootstrap requires explicit --yes confirmation.');
  const user = await input.repositories.users.findById(userId);
  if (!user) throw new Error(`Account not found: ${userId}`);
  if (user.role === 'admin') return { changed: false as const, user, audit: null };

  const updated = await input.repositories.users.setRole(userId, 'admin');
  const audit = await input.repositories.adminAudit.append({
    id: input.createId?.() ?? randomUUID(),
    adminUserId: userId,
    targetUserId: userId,
    action: 'role.bootstrap_admin',
    entityType: 'user_role',
    entityId: userId,
    reason: 'Initial Admin bootstrap',
    beforeJson: { role: user.role },
    afterJson: { role: updated.role },
  });
  return { changed: true as const, user: updated, audit };
}
