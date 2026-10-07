# WasteCore API. Also runs the local stand-ins for Paystack and Termii (see docker-compose.yml).
FROM node:22-bookworm-slim
WORKDIR /app

# Dependencies first, so code changes don't reinstall them. Installing also generates the
# Prisma client, which reads the schema but doesn't connect to a database.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci

COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

ENV NODE_ENV=production
EXPOSE 4000
# Apply database migrations, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
