FROM oven/bun:1.4

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/accord.sqlite

# Dependencies first, so a code change does not reinstall them.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY bin ./bin
COPY lib ./lib
COPY src ./src
COPY drizzle ./drizzle
COPY tsconfig.json ./

RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/system/healthCheck').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Migrate, then run the web process, which starts the worker.
CMD ["sh", "-c", "bun run bin/migrate.ts && exec bun run bin/www.ts"]
