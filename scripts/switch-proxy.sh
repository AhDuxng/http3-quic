#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root_dir}"

usage() {
  echo "Dung: $0 <caddy|lsquic|openlitespeed|status> [--prod]"
}

requested="${1:-}"
mode="${2:-}"

case "${requested}" in
  caddy)
    target="caddy"
    inactive="openlitespeed"
    ;;
  lsquic|openlitespeed|ols)
    target="openlitespeed"
    inactive="caddy"
    ;;
  status)
    active="$(awk -F= '$1 == "COMPOSE_PROFILES" { print $2; exit }' .env 2>/dev/null || true)"
    if [[ "${active}" != "caddy" && "${active}" != "openlitespeed" ]]; then
      active="openlitespeed"
    fi
    COMPOSE_PROFILES="caddy,openlitespeed" PROXY_SERVICE="${active}" docker compose ps
    exit 0
    ;;
  *)
    usage
    exit 1
    ;;
esac

if [[ -n "${mode}" && "${mode}" != "--prod" ]]; then
  usage
  exit 1
fi

compose_file="docker-compose.yml"
if [[ "${mode}" == "--prod" ]]; then
  compose_file="docker-compose.prod.yml"
fi
compose=(docker compose -f "${compose_file}")

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

set_env_value() {
  local key="$1"
  local value="$2"
  local temp_file
  temp_file="$(mktemp "${TMPDIR:-/tmp}/proxy-env.XXXXXX")"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' .env > "${temp_file}"
  mv "${temp_file}" .env
}

echo "Dang dung ${inactive}, chuyen sang ${target}..."
COMPOSE_PROFILES="caddy,openlitespeed" PROXY_SERVICE="${target}" \
  "${compose[@]}" stop backend
COMPOSE_PROFILES="caddy,openlitespeed" PROXY_SERVICE="${target}" \
  "${compose[@]}" stop "${inactive}"

COMPOSE_PROFILES="${target}" PROXY_SERVICE="${target}" \
  "${compose[@]}" up -d --build --force-recreate frontend "${target}" backend

set_env_value COMPOSE_PROFILES "${target}"

echo "Da chuyen sang ${target}."
COMPOSE_PROFILES="caddy,openlitespeed" PROXY_SERVICE="${target}" "${compose[@]}" ps
