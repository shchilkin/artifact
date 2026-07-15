import { randomUUID } from 'node:crypto';
import type { ApiRepositories } from './db/repositories.js';

export async function bootstrapFirstAdmin(input: {
  repositories: ApiRepositories;
  userId: string;
  confirmedUserId: string;
  confirmed: boolean;
  createId?: () => string;
  findAuthenticatedUser?: (userId: string) => Promise<{ id: string; email?: string } | null>;
}) {
  const userId = input.userId.trim();
  if (!userId || userId !== input.confirmedUserId.trim()) {
    throw new Error('Admin bootstrap confirmation must exactly match the account ID.');
  }
  if (!input.confirmed) throw new Error('Admin bootstrap requires explicit --yes confirmation.');
  const user = await findOrSyncBootstrapUser(input.repositories, userId, input.findAuthenticatedUser);
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

async function findOrSyncBootstrapUser(
  repositories: ApiRepositories,
  userId: string,
  findAuthenticatedUser?: (userId: string) => Promise<{ id: string; email?: string } | null>,
) {
  const user = await repositories.users.findById(userId);
  if (user || !findAuthenticatedUser) return user;
  const authenticatedUser = await findAuthenticatedUser(userId);
  return authenticatedUser ? repositories.users.upsertFromAuth(authenticatedUser) : null;
}
