# --- builder stage (runs natively on host arch; JS/HTML outputs are arch-independent) ---
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN STATIC_EXPORT=true npx next build \
 && node scripts/bundle-server.mjs dist/server.cjs

# --- runtime stage ---
FROM node:22-alpine AS runner
WORKDIR /app

ARG VERSION=0.2.1
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="Corellian Spike Sabacc" \
      org.opencontainers.image.description="Self-hosted Star Wars Corellian Spike Sabacc holotable: solo gauntlets, daily seeded Kessel Run, multiplayer cantina, OIDC, and Discord webhooks." \
      org.opencontainers.image.url="https://github.com/thenotoriousJeremy/sabacc" \
      org.opencontainers.image.source="https://github.com/thenotoriousJeremy/sabacc" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache tini su-exec tzdata \
 && mkdir -p /data \
 && chown -R 1000:1000 /data /app

COPY --from=builder /app/dist/server.cjs ./server.cjs
COPY --from=builder /app/out ./web
COPY --from=builder /app/scripts/docker-entrypoint.sh /app/docker-entrypoint.sh

# Normalize line endings in case cloned on Windows with core.autocrlf=true
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh \
 && chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production \
    STATIC_DIR=/app/web \
    CONFIG_DIR=/data \
    PORT=3000 \
    TZ=Etc/UTC \
    PUID=1000 \
    PGID=1000

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "server.cjs"]
