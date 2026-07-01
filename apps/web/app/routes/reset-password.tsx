import { useCallback, useMemo, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Link, useSearchParams } from 'react-router';
import { SiteNav } from '../components/SiteNav';
import { resetArtifactPassword } from '../utils/authClient';

export const meta: MetaFunction = () => [
  { title: 'artifact | Reset password' },
  {
    name: 'description',
    content: 'Choose a new password for your Artifact account.',
  },
];

export default function ResetPasswordRoute() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const tokenError = searchParams.get('error');
  const [error, setError] = useState<string | null>(passwordResetTokenError(token, tokenError));
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  const disabled = useMemo(() => pending || success || !token, [pending, success, token]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!token) return;
      setPending(true);
      setError(null);

      try {
        const formData = new FormData(event.currentTarget);
        const password = String(formData.get('password') ?? '');
        const confirmPassword = String(formData.get('confirmPassword') ?? '');
        if (password.length < 8) {
          setError('Password must be at least 8 characters.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }

        const result = await resetArtifactPassword({ newPassword: password, token });
        if (result.error) {
          setError(passwordResetErrorMessage(result.error.message));
          return;
        }

        setSuccess(true);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not reset password.');
      } finally {
        setPending(false);
      }
    },
    [token],
  );

  return (
    <main className="auth-route min-h-screen bg-bg text-text">
      <SiteNav solid />
      <section className="auth-page-shell" aria-labelledby="reset-password-title">
        <div className="auth-page-panel">
          <p className="auth-page-kicker">Artifact account</p>
          <h1 id="reset-password-title">Choose new password</h1>
          <p className="auth-page-copy">Use a fresh password for your cloud projects and account workspace.</p>

          <form className="auth-page-form" onSubmit={handleSubmit}>
            <label>
              <span>New password</span>
              <input autoComplete="new-password" disabled={disabled} name="password" required type="password" />
            </label>
            <label>
              <span>Confirm password</span>
              <input autoComplete="new-password" disabled={disabled} name="confirmPassword" required type="password" />
            </label>

            {error ? (
              <p className="auth-page-message auth-page-message-error" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="auth-page-message auth-page-message-success" role="status">
                Password updated. You can now sign in with the new password.
              </p>
            ) : null}

            <button className="auth-page-submit" disabled={disabled} type="submit">
              {pending ? 'Updating' : 'Update password'}
            </button>
          </form>

          <Link className="auth-page-link" to="/app">
            Return to editor
          </Link>
        </div>
      </section>
    </main>
  );
}

function passwordResetTokenError(token: string, tokenError: string | null) {
  if (tokenError) return 'This reset link is invalid or expired.';
  if (!token) return 'Open the link from your password reset email.';
  return null;
}

function passwordResetErrorMessage(message: string | undefined) {
  if (!message) return 'Could not reset password.';
  if (/invalid token/i.test(message)) return 'This reset link is invalid or expired.';
  if (/password.*short/i.test(message)) return 'Password must be at least 8 characters.';
  return message;
}
