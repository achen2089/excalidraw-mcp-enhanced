# Multi-stage build for excalidraw-mcp-enhanced
FROM node:22-slim AS base
RUN npm install -g pnpm@10 && npm install -g bun

# ── Build stage ──
FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
RUN pnpm run build:canvas-ui

# ── Canvas server ──
FROM base AS canvas-server
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/canvas-server ./src/canvas-server

ENV PORT=3000
ENV HOST=0.0.0.0
ENV CANVAS_STORE_PATH=/data/canvas-state.json
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "--import", "tsx", "src/canvas-server/index.ts"]

# ── MCP server (stdio) ──
FROM base AS mcp-server
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist

ENV EXPRESS_SERVER_URL=http://canvas-server:3000
CMD ["node", "dist/index.js", "--stdio"]
