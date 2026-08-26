#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root_dir}"

usage() {
  echo "Dung: $0 <caddy|lsquic|openlitespeed|custom|status> [--prod]"
}

requested="${1:-}"
mode="${2:-}"

case "${requested}" in
  caddy)
    target="caddy"
    inactive=("openlitespeed" "custom")
    ;;
  lsquic|openlitespeed|ols)
    target="openlitespeed"
    inactive=("caddy" "custom")
    ;;
  custom)
    target="custom"
    inactive=("caddy" "openlitespeed")
    ;;
  status)
    active="$(awk -F= '$1 == "COMPOSE_PROFILES" { print $2; exit }' .env 2>/dev/null || true)"
    if [[ "${active}" != "caddy" && "${active}" != "openlitespeed" && "${active}" != "custom" ]]; then
      active="openlitespeed"
    fi
    COMPOSE_PROFILES="caddy,openlitespeed,custom" PROXY_SERVICE="${active}" docker compose ps
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

if [[ "${target}" == "custom" ]]; then
  custom_mode="${CUSTOM_MODE:-$(awk -F= '$1 == "CUSTOM_MODE" { print $2; exit }' .env)}"
  custom_mode="${custom_mode:-mpquic}"
  case "${custom_mode}" in
    h2|quic|mpquic) ;;
    *)
      echo "CUSTOM_MODE khong hop le: ${custom_mode}" >&2
      exit 2
      ;;
  esac
  export CUSTOM_MODE="${custom_mode}"

  custom_advertise_h3="${CUSTOM_ADVERTISE_H3:-$(awk -F= '$1 == "CUSTOM_ADVERTISE_H3" { print $2; exit }' .env)}"
  custom_advertise_h3="${custom_advertise_h3:-true}"
  case "${custom_advertise_h3}" in
    true|false) ;;
    *)
      echo "CUSTOM_ADVERTISE_H3 phai la true hoac false." >&2
      exit 2
      ;;
  esac
  export CUSTOM_ADVERTISE_H3="${custom_advertise_h3}"
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

echo "Dang chuyen sang ${target}..."
COMPOSE_PROFILES="caddy,openlitespeed,custom" PROXY_SERVICE="${target}" \
  "${compose[@]}" stop backend
for service in "${inactive[@]}"; do
  COMPOSE_PROFILES="caddy,openlitespeed,custom" PROXY_SERVICE="${target}" \
    "${compose[@]}" stop "${service}"
done

COMPOSE_PROFILES="${target}" PROXY_SERVICE="${target}" \
  "${compose[@]}" up -d --build --force-recreate frontend "${target}" backend

set_env_value COMPOSE_PROFILES "${target}"
if [[ "${target}" == "custom" ]]; then
  set_env_value CUSTOM_MODE "${CUSTOM_MODE}"
  set_env_value CUSTOM_ADVERTISE_H3 "${CUSTOM_ADVERTISE_H3}"
fi

echo "Da chuyen sang ${target}."
COMPOSE_PROFILES="caddy,openlitespeed,custom" PROXY_SERVICE="${target}" "${compose[@]}" ps
