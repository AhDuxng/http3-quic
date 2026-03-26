#!/bin/bash
# =============================================================
# setup-certs.sh - Tao self-signed TLS cert cho server chi co IP
# 
# Chay script nay MOT LAN tren server sau khi git pull:
#   chmod +x scripts/setup-certs.sh
#   ./scripts/setup-certs.sh
#
# Script se tu dong doc SERVER_IP tu file .env
# Sau khi chay xong: docker compose restart caddy
# =============================================================

set -e

# Doc SERVER_IP tu .env (tim dong CORS_ORIGIN=https://x.x.x.x)
# Hoac truyen truc tiep: ./setup-certs.sh 27.71.16.108
if [ -n "$1" ]; then
  SERVER_IP="$1"
elif [ -f ".env" ]; then
  SERVER_IP=$(grep "^CORS_ORIGIN=" .env | sed 's|CORS_ORIGIN=https://||' | tr -d '[:space:]')
fi

if [ -z "$SERVER_IP" ]; then
  echo "??i dung: $0 <SERVER_IP>"
  echo "V?? du:  $0 27.71.16.108"
  exit 1
fi

CERT_DIR="./caddy_config/certs"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"

echo "==> T?o self-signed TLS cert cho IP: $SERVER_IP"
mkdir -p "$CERT_DIR"

# Tao cert voi IP SAN chinh xac (quan trong: phai la IP: khong phai DNS:)
# Chrome/Edge se chap nhan cert nay va cho phep "Proceed anyway"
openssl req -x509 -newkey rsa:4096 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -sha256 -days 3650 -nodes \
  -subj "/CN=$SERVER_IP" \
  -addext "subjectAltName=IP:$SERVER_IP"

chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo ""
echo "==> Cert da tao thanh cong:"
echo "    Cert: $CERT_FILE"
echo "    Key:  $KEY_FILE"
echo "    Han:  3650 ngay (~10 nam)"
echo ""
echo "==> Buoc tiep theo: khoi dong lai Caddy"
echo "    docker compose restart caddy"
echo ""
echo "==> Sau do mo trinh duyet: https://$SERVER_IP"
echo "    Browser se canh bao cert -> bam Advanced -> Proceed"
