import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("app", "routes/generator.tsx"),
  route("examples", "routes/examples.tsx"),
  route("docs/nodes", "routes/docs.nodes.tsx"),
] satisfies RouteConfig;
