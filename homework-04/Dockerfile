# syntax=docker/dockerfile:1

# ---- Build stage: compile TypeScript to JavaScript ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage: production dependencies only ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY views ./views
COPY public ./public

# Run as the unprivileged built-in "node" user.
USER node

EXPOSE 8802

# Basic container health check (the ALB target-group check is the real gate).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8802}/health" || exit 1

# Default command runs the web server. The importer task overrides this with:
#   ["node", "dist/import/index.js", "--now"]
CMD ["node", "dist/server/index.js"]
