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

## Live monitoring — single-click flow

The whole pipeline after the portal is automated; the one manual click is the
report export you already do on the portal with your own authorised session:

```
You click "export" on the IESCMS portal  (the single click)
        ↓  file lands in ~/Downloads
collector/ingest.js --watch              (auto-detects, parses, publishes)
        ↓  data/latest_mgr.json  (+ PostgreSQL insert when C4_DB_URL is set)
Dashboard + MCP server                   (both pick up new data instantly,
                                          no restart — live reload)
        ↓
Claude answers from the fresh snapshot
```

Start the watcher once (e.g. at login):

```bash
node collector/ingest.js --watch ~/Downloads --circle "Circle - 4"
```

Or ingest a single downloaded export by hand:

```bash
node collector/ingest.js ~/Downloads/FL4C___If_any___*.xls --circle "Circle - 4"
```

The ingester understands the portal's export quirks: the ".xls" files are
actually HTML, and numeric cells may arrive as literal `=TRIM(...)` strings.

## Production connection
The portal collector must run on an authorised office machine or secured server. Preserve the authenticated session locally; do not place passwords, OTPs or CAPTCHA handling in the dashboard or MCP server.

## Next source-mapping step
Record the post-login custom-report workflow for each required report. The collector selectors and report-specific parsers can then be completed without guessing field names.
