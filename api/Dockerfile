FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY api/package*.json ./
COPY api/prisma ./prisma/
RUN npm install
COPY api/ .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
COPY --chown=node:node api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
USER node
CMD ["./entrypoint.sh"]
