# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Secrets and .env are injected at runtime via Docker Compose (volume + env_file)
# Do NOT copy .env or secrets/ into the image — they stay on the host

EXPOSE 3000

CMD ["node", "dist/index.js"]
