#!/usr/bin/env bash
set -euo pipefail

readonly cert_dir="/usr/local/lsws/conf/cert"
readonly cert_file="${cert_dir}/server.crt"
readonly key_file="${cert_dir}/server.key"
readonly mounted_cert="/run/tls/server.crt"
readonly mounted_key="/run/tls/server.key"
domain="${DOMAIN:-localhost}"

mkdir -p "${cert_dir}"

if [[ -s "${mounted_cert}" && -s "${mounted_key}" ]]; then
  cp "${mounted_cert}" "${cert_file}"
  cp "${mounted_key}" "${key_file}"
elif [[ ! -s "${cert_file}" || ! -s "${key_file}" ]]; then
  san="DNS:${domain},DNS:localhost,IP:127.0.0.1"
  if [[ "${domain}" =~ ^[0-9a-fA-F:.]+$ ]]; then
    san="IP:${domain},DNS:localhost,IP:127.0.0.1"
  fi

  echo "Generating a self-signed development certificate for ${domain}"
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
    -keyout "${key_file}" \
    -out "${cert_file}" \
    -subj "/CN=${domain}" \
    -addext "subjectAltName=${san}"
fi

chmod 600 "${key_file}"
chmod 644 "${cert_file}"
chown lsadm:lsadm "${key_file}" "${cert_file}"

exec /entrypoint.sh "$@"
