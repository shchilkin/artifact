export function adminTierAssignmentAuditInput() {
  return {
    id: 'audit-1',
    adminUserId: 'admin-1',
    targetUserId: 'user-1',
    action: 'tier.assign',
    entityType: 'tier_assignment',
    entityId: 'assignment-1',
    reason: 'Closed alpha access',
    beforeJson: { tier: 'free' },
    afterJson: { tier: 'creator' },
  };
}
