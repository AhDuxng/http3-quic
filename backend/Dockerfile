FROM node:20-alpine

RUN apk add --no-cache dumb-init iproute2 wget

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["dumb-init", "node", "index.js"]
