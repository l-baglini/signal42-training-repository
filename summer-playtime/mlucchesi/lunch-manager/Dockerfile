# syntax=docker/dockerfile:1

# ---- Build stage: compile TypeScript and the native better-sqlite3 addon ----
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
RUN apk add --no-cache python3 make g++
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY views ./views
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 8900

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8900}/health" || exit 1

CMD ["node", "dist/server.js"]
