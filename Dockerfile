# syntax=docker/dockerfile:1
# ---------- 1) Build del frontend ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# Variables opcionales de compilación (centro del mapa / proveedor de teselas)
ARG VITE_MAP_LAT
ARG VITE_MAP_LNG
ARG VITE_TILE_URL
RUN npm run build

# ---------- 2) Dependencias del backend ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- 3) Imagen final ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/ ./
COPY --from=web /web/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "src/index.js"]
