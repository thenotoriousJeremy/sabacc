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
# smaller image with only production dependencies
FROM node:20-alpine AS runner
WORKDIR /app

# copy built output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# install only production dependencies (omit tsx, typescript, etc.)
RUN npm ci --only=production

# copy any other runtime files (e.g. server.ts compiled if you precompile)
# since we are using tsx to run the server, we still need it and tsx, so
# alternatively precompile server.ts with tsc and COPY dist/server.js here.
COPY --from=builder /app/server.ts ./server.ts

ENV NODE_ENV=production
EXPOSE 3000

# run using tsx so we don't need to transpile at runtime
CMD ["npx","tsx","server.ts"]
