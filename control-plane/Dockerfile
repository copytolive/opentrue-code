FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && rm -rf /root/.npm

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime
WORKDIR /app
# npm/corepack are build-time tools. The control-plane only needs the Node
# runtime plus production dependencies, so do not ship npm's transitive tree.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /root/.npm \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
USER node
EXPOSE 8787
CMD ["node","src/server.mjs"]
