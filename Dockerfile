# syntax=docker/dockerfile:1
FROM oven/bun:1.3 AS base
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DEPLOYMENT_ID
ENV DEPLOYMENT_ID=${DEPLOYMENT_ID}
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$DEPLOYMENT_ID" && bunx prisma generate && bun run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=bun:bun /app/.next/standalone ./
COPY --from=build --chown=bun:bun /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=build --chown=bun:bun /app/.next/static ./.next/static
COPY --from=build --chown=bun:bun /app/public ./public
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "server.js"]