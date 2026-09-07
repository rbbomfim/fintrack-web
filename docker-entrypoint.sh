#!/bin/sh
set -e

mkdir -p /etc/nginx/fintrack

if [ -n "$API_PROXY_TARGET" ]; then
    # Modo same-origin: o nginx repassa /api para o backend e o navegador só fala
    # com a própria origem. Sem cross-origin não há preflight nem CORS.
    API_BASE_URL="${API_BASE_URL:-/api}"
    sed -e "s|__API_PROXY_TARGET__|${API_PROXY_TARGET%/}|g" \
        /etc/nginx/nginx-proxy.template > /etc/nginx/fintrack/proxy.conf
else
    # Modo direto: o navegador chama a API em outro host/porta e o backend precisa
    # liberar a origem do frontend em BACKEND_CORS_ORIGINS.
    if [ -z "$API_BASE_URL" ]; then
        echo "ERRO: defina API_PROXY_TARGET (same-origin) ou API_BASE_URL (modo direto)." >&2
        exit 1
    fi
    case "$API_BASE_URL" in
        /*)
            # Sem proxy, um caminho relativo cairia no fallback do SPA e o app
            # receberia HTML no lugar de JSON. Falha aqui, com a causa explícita.
            echo "ERRO: API_BASE_URL='${API_BASE_URL}' é um caminho relativo, mas API_PROXY_TARGET não foi definido." >&2
            echo "      Defina API_PROXY_TARGET (ex.: http://192.168.3.12:8011) ou use uma URL absoluta em API_BASE_URL." >&2
            exit 1
            ;;
    esac
    : > /etc/nginx/fintrack/proxy.conf
fi

export API_BASE_URL
echo "[fintrack-web] API_BASE_URL=${API_BASE_URL} API_PROXY_TARGET=${API_PROXY_TARGET:-<direto>}"

envsubst '$API_BASE_URL' < /usr/share/nginx/html/env.template.js > /usr/share/nginx/html/env.js
exec nginx -g 'daemon off;'
