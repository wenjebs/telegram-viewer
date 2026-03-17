FROM oven/bun:1 AS build

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy built output, entry script, and node_modules (server needs deps at runtime)
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/docker-entry.ts ./

EXPOSE 3000

CMD ["bun", "run", "docker-entry.ts"]
