FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends docker.io docker-compose ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci && npm install -g @rocket.chat/apps-cli

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY --from=build /app/dist ./dist
COPY scripts/docker-start.sh ./scripts/docker-start.sh

# Copy and install my-rocket-chat dependencies
COPY my-rocket-chat /workspace/my-rocket-chat
WORKDIR /workspace/my-rocket-chat
RUN npm ci
WORKDIR /app

RUN chmod +x ./scripts/docker-start.sh

EXPOSE 3001
CMD ["./scripts/docker-start.sh"]
