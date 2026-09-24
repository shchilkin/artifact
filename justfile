set shell := ["sh", "-eu", "-c"]

doctor:
    node scripts/core-pilot/doctor.mjs macos

dev-web:
    node scripts/core-pilot/doctor.mjs web
    node scripts/core-pilot/runtime-manifest.mjs
    npm run dev:web

dev-macos:
    node scripts/core-pilot/doctor.mjs macos
    npm run build:core-pilot -- macos
    open apps/macos/.build/Artifact.app

build:
    node scripts/core-pilot/doctor.mjs macos
    npm run build:core-pilot
    npm run build:ci

check:
    node scripts/core-pilot/doctor.mjs macos
    npm run check
    npm run check:core
