# Dockerfile - Build image cho backend Node.js
#
# Multi-stage build khong can thiet o day vi backend da nhe san.
# Dung node:18-alpine de giam kich thuoc image (~50MB thay vi ~900MB).

# Base image nhe, Alpine Linux
FROM node:18-alpine

# Cai dat dumb-init de xu ly signal dung cach (PID 1 problem)
# Giup container dung sach khi nhan SIGTERM tu Docker
RUN apk add --no-cache dumb-init

# Dat bien moi truong production
ENV NODE_ENV=production

# Thu muc lam viec trong container
WORKDIR /app

# Copy package.json truoc de tan dung Docker layer cache:
# Layer nay chi bi build lai khi package.json thay doi, khong phai khi code thay doi
COPY package*.json ./

# Cai dat dependencies (chi production, bo qua devDependencies)
RUN npm install --omit=dev

# Copy toan bo source code (sau khi install de toi uu cache)
COPY . .

# Chay voi user khong co quyen root de tang bao mat
USER node

# Khoi dong backend server qua dumb-init de xu ly signal chinh xac
CMD ["dumb-init", "node", "index.js"]