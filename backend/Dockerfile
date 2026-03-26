FROM node:20-alpine

# Cai iproute2 (tc/netem cho local fallback), docker-cli (goi docker exec vao caddy),
# wget (healthcheck), dumb-init (quan ly process)
RUN apk add --no-cache dumb-init iproute2 wget docker-cli

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Giu root de endpoint mo phong mang co the goi tc/netem trong container.

EXPOSE 3000

CMD ["dumb-init", "node", "index.js"]