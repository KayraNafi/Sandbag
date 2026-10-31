FROM node:22-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @sandbag/api --include-workspace-root
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN npm run build -w @sandbag/api

FROM node:22-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
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
