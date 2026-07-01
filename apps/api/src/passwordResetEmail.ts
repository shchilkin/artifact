import type { ApiConfig } from './config.js';
import { logError, logInfo, logWarn } from './logger.js';

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';
const PASSWORD_RESET_SUBJECT = 'Reset your Artifact password';

export interface PasswordResetEmailRequest {
  email: string;
  resetUrl: string;
  userId: string;
}

export interface PasswordResetEmailOptions {
  config: Pick<ApiConfig, 'emailFrom' | 'emailReplyTo' | 'passwordResetLogUrl' | 'resendApiKey'>;
  fetchImpl?: typeof fetch;
}

export async function sendPasswordResetEmail(request: PasswordResetEmailRequest, options: PasswordResetEmailOptions) {
  const { config } = options;
  if (config.passwordResetLogUrl) {
    logInfo('auth.password_reset_debug_link', {
      email: request.email,
      resetUrl: request.resetUrl,
      userId: request.userId,
    });
  }

  if (!config.resendApiKey || !config.emailFrom) {
    logWarn('auth.password_reset_email_not_configured', {
      email: request.email,
      missingFrom: !config.emailFrom,
      missingResendApiKey: !config.resendApiKey,
      userId: request.userId,
    });
    return;
  }

  const response = await (options.fetchImpl ?? fetch)(RESEND_EMAILS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildResendPayload(request, config)),
  }).catch((error: unknown) => {
    logError('auth.password_reset_email_failed', error, {
      email: request.email,
      userId: request.userId,
    });
    return null;
  });

  if (!response) return;
  if (!response.ok) {
    logError('auth.password_reset_email_rejected', await readResponsePreview(response), {
      email: request.email,
      status: response.status,
      userId: request.userId,
    });
    return;
  }

  logInfo('auth.password_reset_email_sent', {
    email: request.email,
    userId: request.userId,
  });
}

function buildResendPayload(request: PasswordResetEmailRequest, config: Pick<ApiConfig, 'emailFrom' | 'emailReplyTo'>) {
  const body = buildPasswordResetEmail(request.resetUrl);
  return {
    from: config.emailFrom,
    to: request.email,
    subject: PASSWORD_RESET_SUBJECT,
    html: body.html,
    text: body.text,
    ...(config.emailReplyTo ? { reply_to: config.emailReplyTo } : {}),
  };
}

function buildPasswordResetEmail(resetUrl: string) {
  const safeUrl = escapeHtml(resetUrl);
  const text = [
    'Reset your Artifact password',
    '',
    'Use the link below to choose a new password. This link expires soon.',
    '',
    resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const html = [
    '<div style="font-family: Inter, Arial, sans-serif; color: #18130f; line-height: 1.5;">',
    '<h1 style="font-size: 24px; margin: 0 0 16px;">Reset your Artifact password</h1>',
    '<p>Use the link below to choose a new password. This link expires soon.</p>',
    '<p>',
    `<a href="${safeUrl}" style="display: inline-block; padding: 12px 18px; border: 1px solid #18130f; background: #ff6a5f; color: #080504; text-decoration: none; font-weight: 800;">Reset password</a>`,
    '</p>',
    '<p style="color: #6e625d;">If you did not request this, you can ignore this email.</p>',
    '</div>',
  ].join('');

  return { html, text };
}

async function readResponsePreview(response: Response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return `HTTP ${response.status}`;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
