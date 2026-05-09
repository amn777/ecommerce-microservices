FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache wget

FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM base AS final
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p logs
ENV NODE_ENV=production
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1
USER node
CMD ["node", "src/index.js"]
