# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

# Stage 2: Runtime image
FROM node:22-alpine AS runtime
WORKDIR /app

# Install native build tools required by better-sqlite3
# (better-sqlite3 ships prebuilds, so this is only needed if rebuild is triggered)
RUN apk add --no-cache python3 make g++

COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY anylist-js/ ./anylist-js/
# Fail fast if the submodule wasn't initialized before building
RUN test -f anylist-js/lib/index.js || \
    { echo "ERROR: anylist-js submodule is missing. Run: git submodule update --init" && exit 1; }
COPY package.json ./

# Persistent data directory (SQLite DB) and config directory (allowed-emails.txt)
RUN mkdir -p /data /config
VOLUME /data
ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/http/index.js"]
