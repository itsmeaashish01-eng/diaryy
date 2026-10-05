#!/bin/sh
# Market Lens — double-click on macOS (or run ./market/start.command on Linux).
# Needs Node.js 18+ (https://nodejs.org).
cd "$(dirname "$0")/.." && exec node market/server.mjs
