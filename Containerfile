FROM docker.io/library/node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM docker.io/library/node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY data ./data
# The certificate lives here (a volume), made on first start.
RUN mkdir -p /app/certs && chown node:node /app/certs
USER node
EXPOSE 8450
CMD ["node", "dist/server/index.js"]
