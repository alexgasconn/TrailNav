#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
printf '%s\n' 'TrailNav - Instalacion y verificacion'
npm ci
npm run check
printf '%s\n' 'Verificacion completada. Para probar la PWA: npm run preview'
printf '%s\n' 'Documentacion: README.md, CONTRIBUTING.md y FEATURES_STATUS.md'