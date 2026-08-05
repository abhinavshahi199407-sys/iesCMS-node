#!/usr/bin/env bash
# Cron entry point (see schedule.example.cron). Runs one fetch+ingest cycle
# using the saved Chrome profile. If the portal session has expired, the run
# logs a login prompt and skips — log in again via: npm run setup
cd "$(dirname "$0")" || exit 1
exec node fetch_reports.mjs --once "$@"
