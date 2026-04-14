#!/bin/sh
set -eu

echo "[backend] prisma generate"
npx prisma generate

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "[backend] prisma migrate deploy"
  npx prisma migrate deploy
else
  echo "[backend] migrations not found, fallback to prisma db push"
  npx prisma db push
fi

# Ensure my-rocket-chat dependencies are installed
if [ -d "/workspace/my-rocket-chat" ]; then
  if [ ! -d "/workspace/my-rocket-chat/node_modules" ]; then
    echo "[backend] installing my-rocket-chat dependencies"
    cd /workspace/my-rocket-chat
    npm ci
    cd /app
  fi
fi

echo "[backend] start app"
node dist/src/main.js
