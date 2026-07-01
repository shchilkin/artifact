import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendPasswordResetEmail } from '../src/passwordResetEmail.js';

const resetRequest = {
  email: 'artist@example.com',
  resetUrl:
    'https://api.artifact.example/api/auth/reset-password/token?callbackURL=https%3A%2F%2Fartifact.example%2Freset-password',
  userId: 'user-1',
};

describe('sendPasswordResetEmail', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('sends password reset email through Resend when configured', async () => {
    const fetchCalls: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      fetchCalls.push([input, init]);
      return new Response('{}', { status: 200 });
    };

    await sendPasswordResetEmail(resetRequest, {
      config: {
        emailFrom: 'Artifact <hello@artifact.example>',
        emailReplyTo: 'support@artifact.example',
        passwordResetLogUrl: false,
        resendApiKey: 're_test',
      },
      fetchImpl,
    });

    expect(fetchCalls[0]).toEqual([
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer re_test',
          'Content-Type': 'application/json',
        },
      }),
    ]);
    const payload = JSON.parse(String(fetchCalls[0]?.[1]?.body));
    expect(payload).toMatchObject({
      from: 'Artifact <hello@artifact.example>',
      html: expect.stringContaining('Reset your Artifact password'),
      reply_to: 'support@artifact.example',
      subject: 'Reset your Artifact password',
      text: expect.stringContaining(resetRequest.resetUrl),
      to: 'artist@example.com',
    });
  });

  it('does not call Resend when delivery is not configured', async () => {
    const fetchImpl = vi.fn();

    await sendPasswordResetEmail(resetRequest, {
      config: {
        passwordResetLogUrl: true,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('auth.password_reset_debug_link'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('auth.password_reset_email_not_configured'));
  });
});
