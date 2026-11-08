# Misthra's branded Elysium RPC. No dependencies; build context is the repo root.
FROM node:24-slim
WORKDIR /app
COPY rpc ./rpc
ENV NODE_ENV=production HOST=0.0.0.0
USER node
EXPOSE 8545
CMD ["node", "rpc/index.mjs"]
