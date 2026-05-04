FROM node:20-bookworm-slim AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SOCKET_URL

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev

COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./
COPY --from=build /app/global.d.ts ./

EXPOSE 3000
CMD ["sh", "-c", "npm start -- -H 0.0.0.0 -p ${PORT:-3000}"]
