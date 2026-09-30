# One container: API + Socket.io + the built frontend, on one HTTPS origin.
# Railway and Render both auto-detect this file.
FROM node:22-slim

# Build tools are only used if better-sqlite3 can't download a prebuilt binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# Build Person D's frontend if it exists; the server serves apps/web/dist.
RUN if [ -f apps/web/package.json ]; then pnpm --filter web build; fi

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/rugbygrid.db \
    SEED_ON_BOOT=true
RUN mkdir -p /data
EXPOSE 3000
CMD ["pnpm", "--filter", "server", "start"]
