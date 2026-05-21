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
COPY --from=build /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api
USER node

CMD ["node", "dist/worker.js"]
