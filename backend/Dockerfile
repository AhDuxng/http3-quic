FROM node:20-alpine

# Cai iproute2: chua lenh `tc` de thuc hien traffic shaping (netem)
# Cai wget: dung cho healthcheck endpoint
# Luu y: backend dung network_mode: service:caddy -> tc chay tren eth0 cua Caddy
RUN apk add --no-cache dumb-init iproute2 wget

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Giu root de endpoint mo phong mang co the goi tc/netem trong container.

EXPOSE 3000

CMD ["dumb-init", "node", "index.js"]