# ── Etapa 1: dependencias ────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Etapa 2: build ───────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ── Etapa 3: dependencias de producción ──────────────────
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ── Etapa 4: runtime ─────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nestjs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build     --chown=nestjs:nodejs /app/dist         ./dist
COPY --from=build     --chown=nestjs:nodejs /app/package.json ./

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1))"

CMD ["sh", "-c", "node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js && node dist/main.js"]
