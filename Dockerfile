# Node 24 ships a stable built-in node:sqlite (no native module to compile).
FROM node:24-bookworm-slim

# ffmpeg for playback tooling; python3 + cleanvid are optional (profanity filter).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
  && pip3 install --no-cache-dir --break-system-packages cleanvid \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm run install:all

# Build client, then copy the rest
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "server/index.js"]
