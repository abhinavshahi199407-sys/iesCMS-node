# Gautam Buddh Nagar Excise Command Centre v2

A deployment-ready prototype for district-wide monitoring (Circle 1–6), initially populated with the uploaded Circle-4 FL4C MGR report.

## What works now
- Responsive command dashboard
- Circle-4 FL4C MGR parsing and risk ranking
- Architecture for current-day vs same-day LY and MTD vs LY-MTD
- 08:00–22:00, 30-minute collector schedule template
- PostgreSQL schema and a working read-only MCP server (`mcp/`)

## MCP server
`mcp/` contains a full Node.js MCP server (`gbn-excise-mcp-server`) exposing six
read-only tools: `get_district_summary`, `compare_cy_ly`, `list_low_performers`,
`get_shop_profile`, `list_active_alerts` and `generate_deo_brief`. It runs
against the monitoring PostgreSQL DB (read-only sessions) or, with zero config,
against the JSON snapshots in `data/`. See `mcp/README.md` for setup, client
configuration and the evaluation suite.

```bash
cd circle4-v2-command-centre/mcp
npm install && npm test
```

## Preview
Serve the project root so `public/index.html` can load `data/sample_mgr.json`:

```bash
cd circle4-v2-command-centre
python -m http.server 8080
# open http://localhost:8080/public/
```

## Live monitoring

Two levels of automation, both running on the authorised office machine:

**Level 1 — single click.** You export the report on the portal yourself; the
watcher ingests it the moment the download finishes:

```bash
node collector/ingest.js --watch ~/Downloads --circle "Circle - 4"
```

**Level 2 — zero click on a schedule.** `collector/fetch_reports.mjs` drives
your own Chrome (persistent profile). You log in once manually — username,
password, CAPTCHA, OTP are always typed by you; the script only waits — and it
then reopens the saved report page every 30 minutes (08:00–22:00), clicks
export, and ingests automatically:

```bash
cd collector
npm install                                # playwright-core, uses installed Chrome
cp portal.config.example.json portal.config.json
npm run setup                              # log in + navigate once, URL is saved
npm run loop                               # or wire run_collector.sh into cron
```

When the portal session expires, the run pauses with a login prompt instead of
failing — complete the login in the window and it continues.

```
IESCMS portal (your authorised session)
        ↓  fetch_reports.mjs (scheduled export click)  — or your manual export
collector/ingest.js                       (parses fake-.xls HTML, =TRIM cells)
        ↓  data/latest_mgr.json  (+ PostgreSQL insert when C4_DB_URL is set)
Dashboard + MCP server                    (live reload — no restart)
        ↓
Claude answers from the fresh snapshot
```

## Production connection
The portal collector must run on an authorised office machine or secured server. Preserve the authenticated session locally; do not place passwords, OTPs or CAPTCHA handling in the dashboard or MCP server.

## Next source-mapping step
Record the post-login custom-report workflow for each required report. The collector selectors and report-specific parsers can then be completed without guessing field names.
