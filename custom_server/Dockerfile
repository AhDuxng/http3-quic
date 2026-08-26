FROM node:20-bookworm AS frontend-build

WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM debian:bookworm AS picoquic-build

ARG PICOQUIC_COMMIT=4685671759703c1ba20d7251c766e055b779341c
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates cmake git libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src/picoquic
RUN git init \
    && git remote add origin https://github.com/private-octopus/picoquic.git \
    && git fetch --depth 1 origin "${PICOQUIC_COMMIT}" \
    && git checkout --detach FETCH_HEAD
COPY custom_server/picoquic-dash.patch /tmp/picoquic-dash.patch
RUN git apply /tmp/picoquic-dash.patch \
    && cmake -S . -B build \
      -DCMAKE_BUILD_TYPE=Release \
      -DPICOQUIC_FETCH_PTLS=Y \
      -Dpicoquic_BUILD_TESTS=OFF \
      -DBUILD_PICO_SIM=OFF \
      -DBUILD_PQBENCH=OFF \
    && cmake --build build --target picoquicdemo --parallel

FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=picoquic-build /src/picoquic/build/picoquicdemo /usr/local/bin/picoquicdemo
COPY --from=frontend-build /src/frontend/dist /srv/www
COPY custom_server/server.mjs custom_server/normalize-qlog.mjs /opt/custom-server/
COPY custom_server/server /usr/local/bin/server

RUN chmod +x /usr/local/bin/server \
    && mkdir -p /srv/video /var/log/custom-server/qlog /var/lib/custom-server/cert

EXPOSE 80/tcp 443/tcp 443/udp
ENTRYPOINT ["server"]
CMD ["--mode", "mpquic"]
