#!/bin/sh
# Build Vercel : compilation, puis migrations et seed (idempotent) en production uniquement.
set -e
npm run build
if [ "$VERCEL_ENV" = "production" ] || [ "$MIGRER_AU_BUILD" = "1" ]; then
  npm run migration:run
  npm run seed
fi
