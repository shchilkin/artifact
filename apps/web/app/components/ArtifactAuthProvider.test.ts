import { describe, expect, it } from 'vitest';
import { getClerkBrowserScriptUrl } from '../utils/clerkAuth';

describe('getClerkBrowserScriptUrl', () => {
  it('builds a Clerk browser script URL from a publishable key', () => {
    const frontendApi = 'clerk.artifact.example$';
    const key = `pk_test_${Buffer.from(frontendApi).toString('base64')}`;

    expect(getClerkBrowserScriptUrl(key)).toMatch(
      /^https:\/\/clerk\.artifact\.example\/npm\/@clerk\/clerk-js@6\/dist\/clerk\.browser\.js$/,
    );
  });

  it('returns null for an invalid publishable key', () => {
    expect(getClerkBrowserScriptUrl('not-a-key')).toBeNull();
  });
});
