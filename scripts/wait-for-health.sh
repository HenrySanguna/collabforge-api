#!/usr/bin/env bash
set -euo pipefail
URL="$1"; EXPECTED_SHA="$2"; DEADLINE=$((SECONDS + 300))

until [ "$SECONDS" -ge "$DEADLINE" ]; do
  DEPLOYED=$(curl -fsS --max-time 90 "$URL/health" | jq -r '.commit // empty') || true
  if [ "$DEPLOYED" = "$EXPECTED_SHA" ]; then
    echo "✅ Desplegado $EXPECTED_SHA"; exit 0
  fi
  echo "⏳ esperando… (actual: ${DEPLOYED:-sin respuesta})"; sleep 10
done

echo "::error::El despliegue no alcanzó el estado saludable en 5 minutos"; exit 1
