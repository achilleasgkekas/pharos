# Price scraper worker. Lightweight: tsx runtime, no build step.
FROM node:24-alpine

WORKDIR /app

# Install deps first for layer caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm install tsx

COPY tsconfig.json ./
COPY src ./src

# Reaches Mongo + Ollama via env (see docker-compose).
CMD ["npx", "tsx", "src/index.ts"]
