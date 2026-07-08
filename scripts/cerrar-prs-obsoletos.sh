#!/bin/bash
# Cierra PRs superseded en main v299 (ejecutar con gh autenticado como Randy)
set -euo pipefail

PRS=(113 114 88 19 17 16 10)
MSG="Superseded: cambios ya en main v299."

if ! command -v gh >/dev/null 2>&1; then
  echo "Instala GitHub CLI: https://cli.github.com/"
  exit 1
fi

echo "Cerrando ${#PRS[@]} PRs obsoletos..."
for pr in "${PRS[@]}"; do
  if gh pr view "$pr" --json state -q .state 2>/dev/null | grep -q OPEN; then
    gh pr close "$pr" --comment "$MSG" && echo "OK #$pr cerrado" || echo "FALLO #$pr"
  else
    echo "SKIP #$pr (ya cerrado o no existe)"
  fi
done
echo "Listo."
