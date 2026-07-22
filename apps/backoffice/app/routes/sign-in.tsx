import { Button, Field, InlineNotice, Input } from '@artifact/ui';
import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { authClient } from '../lib/authClient';

export function meta() {
  return [{ title: 'Sign in | Artifact Backoffice' }];
}

export default function SignInRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const message = await signInError(new FormData(event.currentTarget));
    setPending(false);
    if (message) return setError(message);
    await navigate(safeReturnPath(searchParams.get('returnTo')), {
      replace: true,
    });
  };

  return (
    <main className="sign-in-page">
      <section className="sign-in-panel" aria-labelledby="sign-in-title">
        <div className="sign-in-brand">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>artifact / backoffice</span>
        </div>
        <p className="eyebrow">Restricted operations</p>
        <h1 id="sign-in-title">Sign in</h1>
        <p className="page-summary">Account access and provider usage are available to Artifact Admins only.</p>
        <form className="sign-in-form" onSubmit={(event) => void submit(event)}>
          <Field label="Email">
            <Input autoComplete="email" autoFocus name="email" required type="email" />
          </Field>
          <Field label="Password">
            <Input autoComplete="current-password" name="password" required type="password" />
          </Field>
          {error ? <InlineNotice variant="danger">{error}</InlineNotice> : null}
          <Button loading={pending} type="submit" variant="primary">
            {pending ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
        <a className="back-link" href="https://artifact.shchilkin.dev/app">
          Return to Artifact
        </a>
      </section>
    </main>
  );
}

async function signInError(form: FormData) {
  try {
    const result = await authClient.signIn.email({
      email: formText(form, 'email').trim(),
      password: formText(form, 'password'),
      rememberMe: true,
    });
    return authErrorMessage(result.error);
  } catch (caught) {
    return requestErrorMessage(caught);
  }
}

function authErrorMessage(error: { message?: string } | null) {
  if (!error) return null;
  if (error.message) return error.message;
  return 'The email or password was not accepted.';
}

function requestErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'The account service could not be reached.';
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

function safeReturnPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}
