#!/usr/bin/env bash
set -euo pipefail

domain="${1:-${DOMAIN:-}}"
if [[ -z "${domain}" && -f .env ]]; then
  domain="$(sed -n 's/^DOMAIN=//p' .env | tail -n 1 | tr -d '[:space:]')"
fi

if [[ -z "${domain}" ]]; then
  domain="localhost"
fi

cert_dir="./openlitespeed_config/certs"
cert_file="${cert_dir}/server.crt"
key_file="${cert_dir}/server.key"
mkdir -p "${cert_dir}"

if command -v mkcert >/dev/null 2>&1; then
  echo "==> Creating a locally trusted certificate with mkcert for: ${domain}"
  mkcert -cert-file "${cert_file}" -key-file "${key_file}" \
    "${domain}" localhost 127.0.0.1 ::1
else
  san="DNS:${domain},DNS:localhost,IP:127.0.0.1"
  if [[ "${domain}" =~ ^[0-9a-fA-F:.]+$ ]]; then
    san="IP:${domain},DNS:localhost,IP:127.0.0.1"
  fi

  echo "==> mkcert was not found; creating a self-signed certificate for: ${domain}"
  openssl req -x509 -newkey rsa:2048 \
    -keyout "${key_file}" \
    -out "${cert_file}" \
    -sha256 -days 3650 -nodes \
    -subj "/CN=${domain}" \
    -addext "subjectAltName=${san}"
  echo "==> Warning: browsers generally require a trusted certificate before using HTTP/3."
fi

chmod 600 "${key_file}"
chmod 644 "${cert_file}"

echo "==> Certificate: ${cert_file}"
echo "==> Private key: ${key_file}"
echo "==> Recreate OpenLiteSpeed to load it:"
echo "    docker compose up -d --force-recreate openlitespeed"
