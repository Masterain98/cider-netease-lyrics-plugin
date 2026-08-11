FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY gateway/package.json gateway/package.json
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY gateway gateway
RUN pnpm --filter @cider-netease/shared build && pnpm --filter @cider-netease/gateway build
RUN pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/gateway/package.json ./gateway/package.json
COPY --from=build /app/gateway/dist ./gateway/dist
COPY --from=build /app/gateway/node_modules ./gateway/node_modules
USER node
EXPOSE 3100
CMD ["node", "gateway/dist/server.js"]
