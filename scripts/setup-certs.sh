#!/bin/bash
set -e

if [ -n "$1" ]; then
  serverIp="$1"
elif [ -f ".env" ]; then
  serverIp=$(grep "^CORS_ORIGIN=" .env | sed 's|CORS_ORIGIN=https://||' | tr -d '[:space:]')
fi

if [ -z "$serverIp" ]; then
  echo "??i dung: $0 <SERVER_IP>"
  echo "V?? du:  $0 27.71.16.108"
  exit 1
fi

certDir="./caddy_config/certs"
certFile="$certDir/server.crt"
keyFile="$certDir/server.key"

echo "==> T?o self-signed TLS cert cho IP: $serverIp"
mkdir -p "$certDir"

openssl req -x509 -newkey rsa:4096 \
  -keyout "$keyFile" \
  -out "$certFile" \
  -sha256 -days 3650 -nodes \
  -subj "/CN=$serverIp" \
  -addext "subjectAltName=IP:$serverIp"

chmod 600 "$keyFile"
chmod 644 "$certFile"

echo ""
echo "==> Cert da tao thanh cong:"
echo "    Cert: $certFile"
echo "    Key:  $keyFile"
echo "    Han:  3650 ngay (~10 nam)"
echo ""
echo "==> Buoc tiep theo: khoi dong lai Caddy"
echo "    docker compose restart caddy"
echo ""
echo "==> Sau do mo trinh duyet: https://$serverIp"
echo "    Browser se canh bao cert -> bam Advanced -> Proceed"
