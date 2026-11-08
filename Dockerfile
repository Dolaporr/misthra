# Misthra: one service serving the API and the built frontend.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    DB_PATH=/data/misthra.sqlite
# The Agents section's balances are simulated and labelled as such. Remove this
# once real escrow reconciliation exists; production otherwise refuses demo mode.
ENV ALLOW_DEMO_PRODUCTION=1
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/chain ./chain
COPY --from=build /app/indexer ./indexer
COPY --from=build /app/fixtures ./fixtures
COPY --from=build /app/public ./public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
