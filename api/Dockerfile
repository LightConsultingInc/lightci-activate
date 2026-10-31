# syntax=docker/dockerfile:1
# Build context is the REPO ROOT (the API image also carries the MCP app bundle).
#   docker build -f api/Dockerfile .                              release image, no demo data
#   docker build -f api/Dockerfile --build-arg DEMO_MARKETPLACE=1 .   LightCI demo environments only
#
# One image serves every role: `node dist/main.js` (api), and the `activate` CLI
# (migrate, and later doctor/bootstrap). Runs as uid 1001 with a read-only root
# filesystem; the only writable paths are /tmp and /data.
ARG NODE_IMAGE=node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
ARG DEMO_MARKETPLACE=0

FROM ${NODE_IMAGE} AS mcp-app
WORKDIR /mcp-app
COPY mcp-app/package.json mcp-app/yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install
COPY mcp-app/ .
RUN yarn build

FROM ${NODE_IMAGE} AS api
WORKDIR /app
COPY api/package.json api/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY api/ .
RUN yarn build && yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean

# The demo marketplace is opt-in. Stage 0 is an empty folder; stage 1 carries the demo repo.
FROM ${NODE_IMAGE} AS marketplace-0
RUN mkdir -p /srv/marketplace
FROM ${NODE_IMAGE} AS marketplace-1
RUN mkdir -p /srv/marketplace
COPY marketplace/ /srv/marketplace/
FROM marketplace-${DEMO_MARKETPLACE} AS marketplace

FROM ${NODE_IMAGE}
RUN apk add --no-cache git
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    MCP_APP_HTML=/mcp-app/dist/app.html \
    LIBRARY_WORK_DIR=/data/marketplace-work
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY --from=api /app/package.json ./package.json
COPY api/certs ./certs
COPY --from=mcp-app /mcp-app/dist /mcp-app/dist
COPY --from=marketplace /srv/marketplace/ /marketplace/
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nodeuser \
  && mkdir -p /data \
  && chown -R nodeuser:nodejs /marketplace /data \
  && git config --system safe.directory '*' \
  && printf '#!/bin/sh\nexec node /app/dist/cli.js "$@"\n' > /usr/local/bin/activate \
  && chmod +x /usr/local/bin/activate
USER nodeuser
EXPOSE 3000
CMD ["node", "dist/main.js"]
