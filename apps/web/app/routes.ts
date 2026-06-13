import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('app', 'routes/editor.tsx'),
  route('projects', 'routes/projects.tsx'),
  route('examples', 'routes/examples.tsx'),
  route('showcase', 'routes/showcase.tsx'),
  route('docs', 'routes/docs.tsx'),
  route('docs/nodes', 'routes/docs.nodes.tsx'),
  route('docs/recipes', 'routes/docs.recipes.tsx'),
  route('docs/reference', 'routes/docs.reference.tsx'),
  route('docs/reference/:nodeId', 'routes/docs.reference-detail.tsx'),
  route('docs/style-guide', 'routes/docs.style-guide.tsx'),
] satisfies RouteConfig;
