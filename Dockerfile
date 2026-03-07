# --- builder stage ---
# build everything and keep dev dependencies so that tsx/build tools exist
FROM node:20-alpine AS builder
WORKDIR /app

# copy only package files first so that Docker can cache npm install layers
COPY package.json package-lock.json* ./
RUN npm ci                  # installs both deps & devDeps (tsx, typescript, etc.)

# copy source and build the Next.js app
COPY . .
RUN npm run build           # Next.js will compile and output into .next

# --- runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app

# copy built Next.js output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# copy source files needed at runtime (for tsx to resolve imports)
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app

ENV NODE_ENV=production
EXPOSE 3000

# run the custom server (which includes Socket.io)
CMD ["npx", "tsx", "server.ts"]
