# Price scraper worker. Lightweight: tsx runtime, no build step.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

WORKDIR /app

# Install deps first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

# Reaches Mongo + Ollama via env (see docker-compose).
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
