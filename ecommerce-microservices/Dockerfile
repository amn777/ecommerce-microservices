FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache wget

COPY api-gateway/package*.json ./
RUN npm install --only=production

COPY api-gateway/ .
RUN mkdir -p logs

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

USER node
CMD ["node", "src/index.js"]
