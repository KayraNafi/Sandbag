FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @sandbag/api --include-workspace-root
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN npm run build -w @sandbag/api

FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @sandbag/api --omit=dev && npm cache clean --force
# Nothing needs a package manager at runtime, and it brings its own vulnerabilities.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY apps/api/migrations apps/api/migrations
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
ENV MIGRATIONS_DIR=/app/apps/api/migrations
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
