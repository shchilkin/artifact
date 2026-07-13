# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV CI=true
ENV HUSKY=0

ARG VITE_BACKOFFICE_API_BASE_URL=https://api.artifact.shchilkin.dev
ENV VITE_BACKOFFICE_API_BASE_URL=$VITE_BACKOFFICE_API_BASE_URL

COPY . .
RUN npm ci
RUN npm run build --workspace=@artifact/backoffice

FROM nginxinc/nginx-unprivileged:1.30.3-alpine AS runtime

COPY docker/backoffice.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/apps/backoffice/build/client /usr/share/nginx/html

USER 101

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

