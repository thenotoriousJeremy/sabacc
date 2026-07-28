# --- builder stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# Package files first so the install layer caches independently of source.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# The container serves a prebuilt static bundle and a bundled server, so the
# Next runtime and the dev toolchain stay out of the final image.
RUN STATIC_EXPORT=true npx next build \
 && node scripts/bundle-server.mjs dist/server.cjs

# --- runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app

# esbuild inlined every dependency, so there is no node_modules to copy.
COPY --from=builder /app/dist/server.cjs ./server.cjs
COPY --from=builder /app/out ./web

ENV NODE_ENV=production
ENV STATIC_DIR=/app/web
ENV PORT=3000
EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.cjs"]
