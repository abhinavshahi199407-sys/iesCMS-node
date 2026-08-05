# gbn-excise-mcp-server

Read-only MCP (Model Context Protocol) server for the Gautam Buddh Nagar Excise
Command Centre. It lets an AI assistant (Claude Desktop, Claude Code, or any MCP
client) query district/circle MGR performance, rank low performers, pull shop
profiles, list alerts and generate DEO briefings — strictly from verified report
snapshots. It never writes, never touches the portal, and never handles
credentials, OTPs or CAPTCHAs (those stay in the authorised collector layer).

## Setup

```bash
cd circle4-v2-command-centre/mcp
npm install
npm test        # end-to-end smoke test against the sample snapshot
```

## Data sources

Selected automatically from the environment:

| Environment | Source |
|---|---|
| `C4_DB_URL` or `DATABASE_URL` set | Monitoring PostgreSQL DB (`sql/schema.sql`). Every session is forced read-only via `default_transaction_read_only=on`. |
| `C4_DATA_DIR` set | Any directory of normalized collector JSON snapshots (`{ generated_from, rows: [...] }`, as produced by `collector/parse_upexcise_xls.py`). |
| nothing set | The project's `../data/` folder (ships with the Circle-4 FL4C Jul-2026 sample). |

**Live monitoring:** in JSON mode the server re-checks the data directory on
every query and reloads changed files automatically — when
`collector/ingest.js --watch` publishes a new snapshot, the very next tool call
answers from it. No restart needed.

In PostgreSQL mode the server reads the latest snapshot per shop from
`report_snapshots` (`report_type = 'MGR'`, normalized row stored in the
`metric` jsonb column — same keys as the collector JSON output) and open rows
from `alerts`. In JSON mode, alerts are derived live from the MGR pace rules
(<50% critical, <80% watch) and marked `derived_from_rules: true`.

## Tools

| Tool | Purpose |
|---|---|
| `get_district_summary` | District/circle KPIs: MGR assigned/lifted/balance, weighted achievement %, distribution, strongest/weakest shop. |
| `compare_cy_ly` | CY vs LY comparison (`mtd` or `day` scope). Refuses to compare when the LY side or daily feed is missing — it reports CY alone with an explicit reason instead of silently comparing partial data. |
| `list_low_performers` | Shops below an achievement threshold, worst first, with risk band and balance to lift. |
| `get_shop_profile` | One shop's identity, MGR history, risk and open alerts. Accepts an exact shop ID (case-insensitive) or partial shop name. |
| `list_active_alerts` | Open critical/watch alerts for the district or one circle. |
| `generate_deo_brief` | Markdown DEO briefing built only from database metrics — laggards, over-achievers, alerts, and an explicit note for any feed not yet connected. |

All tools are annotated `readOnlyHint: true`.

## Connecting a client

Claude Desktop / Claude Code (`.mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gbn-excise": {
      "command": "node",
      "args": ["/absolute/path/to/circle4-v2-command-centre/mcp/server.js"],
      "env": {
        "C4_DB_URL": "postgres://readonly_user:...@localhost:5432/gbn_excise"
      }
    }
  }
}
```

Omit `env` to run against the shipped JSON sample. Debug interactively with:

```bash
npx @modelcontextprotocol/inspector node server.js
```

## Evaluation

`evals/evaluation.xml` contains 10 verified question/answer pairs for testing
how well an LLM answers real monitoring questions through these tools.
