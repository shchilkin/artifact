import { index, layout, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  route('sign-in', 'routes/sign-in.tsx'),
  layout('routes/admin-layout.tsx', [
    index('routes/overview.tsx'),
    route('accounts', 'routes/accounts.tsx'),
    route('accounts/:userId', 'routes/account-detail.tsx'),
    route('usage', 'routes/usage.tsx'),
  ]),
] satisfies RouteConfig;
