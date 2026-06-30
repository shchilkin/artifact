# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV CI=true
ENV HUSKY=0

COPY . .
RUN npm ci
RUN npm run build --workspace=@artifact/api

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0

COPY . .
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
RUN mkdir -p /var/lib/artifact/generated-assets && chown -R node:node /var/lib/artifact

WORKDIR /app/apps/api
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node dist/healthcheck.js api

CMD ["node", "dist/server.js"]
