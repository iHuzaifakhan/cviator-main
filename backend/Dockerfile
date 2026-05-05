# backend/Dockerfile
# Builds the Express + Puppeteer API image.
# Puppeteer needs Chromium and a bunch of system libraries, so we start from
# a Debian-based Node image and install them manually.

FROM node:18-slim

# --- Install Chromium + the libs Puppeteer needs to run headless Chrome ---
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libxshmfence1 \
      xdg-utils \
      ca-certificates \
      wget \
 && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system Chromium and skip its own download.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# --- App setup ---
WORKDIR /app

# Copy package files first so Docker caches `npm install` when source changes.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the source
COPY . .

EXPOSE 5000

# Start the server
CMD ["node", "server.js"]
