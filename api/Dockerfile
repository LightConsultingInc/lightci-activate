# Build context is the REPO ROOT (the API image also carries the MCP app bundle and the
# demo marketplace repo). Build: docker build -f api/Dockerfile .
FROM node:22-alpine AS mcp-app
WORKDIR /mcp-app
COPY mcp-app/package.json mcp-app/yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install
COPY mcp-app/ .
RUN yarn build

FROM node:22-alpine AS api
WORKDIR /app
COPY api/package.json api/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY api/ .
RUN yarn build && yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean

FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app
ENV NODE_ENV=production PORT=3000 LIBRARY_REPO_PATH=/marketplace MCP_APP_HTML=/mcp-app/dist/app.html
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY --from=api /app/package.json ./package.json
COPY --from=mcp-app /mcp-app/dist /mcp-app/dist
COPY marketplace/ /marketplace/
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nodeuser \
  && chown -R nodeuser:nodejs /marketplace && git config --system safe.directory /marketplace
USER nodeuser
EXPOSE 3000
CMD ["node", "dist/main.js"]
