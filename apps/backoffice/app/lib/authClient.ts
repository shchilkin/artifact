import { createAuthClient } from 'better-auth/react';
import { getBackofficeApiBaseUrl } from './apiBaseUrl';
import { persistAuthBearerToken, readAuthBearerToken } from './authToken';

export { clearAuthBearerToken } from './authToken';

export const authClient = createAuthClient({
  baseURL: getBackofficeApiBaseUrl(),
  fetchOptions: {
    credentials: 'include',
    auth: {
      type: 'Bearer',
      token: () => readAuthBearerToken() ?? '',
    },
    onSuccess: (context) => persistAuthBearerToken(context.response.headers.get('set-auth-token')),
  },
});
