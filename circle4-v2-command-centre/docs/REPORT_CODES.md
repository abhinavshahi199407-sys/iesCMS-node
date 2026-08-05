# MIS report codes (mis.upexciseonline.co)

Search these codes on `/dashboard/omisystem/customreport`, or open directly as
`/dashboard/omisystem/wscheckcustomreport?rc=<code>`. Sources: operator-supplied
codes + the public code list at abkaritoday.com (page_id=13888).

## In the collector roster (portal.config.example.json)

| Code | Report | Feeds (DATA_MAPPING item) |
|---|---|---|
| 237201 | FL4C MGR — select last + current year | MGR lifting (5) + LY side of YoY (2,4) |
| 21720 | FL5DB month-wise, last year | LY-MTD comparison (4) |
| 25720 | FL5DB — District/Month-wise MGR Lifting, FL & Beer, 2026-27 | MGR lifting (5), CY MTD (3) |
| 24720 | FL4A MGR | MGR lifting (5) |
| 237211 | CL5C (100–200 ml) | MGR/MGQ lifting (5) |
| 247211 | CL5CC composite (100–200 ml) | MGQ lifting (5) |
| 24721 | District/Month/**Shop-wise** MGQ lifting, CL5C & CL5CC, 2026-27 | Shop-level lifting (5) — preferred over district-wise for the shop table |
| 20705 / 207055 | POS sales | POS scan compliance (7) |
| 20796 | FL & Beer — warehouse to retail dispatch | Dispatch / stock-in (6) |
| 20798 | CL — warehouse to retail dispatch | Dispatch / stock-in (6) |
| 21777 | Invoice summary, licence-type-wise sale — all except beer | Sales value (1,3) |

Disabled by default in the roster (flip `"enabled": true` to collect):

| Code | Report |
|---|---|
| 21775 | Invoice summary, licence-type-wise sale — brewery |
| 25722 | FL5DB FL-only MGR lifting, with UP-made wine MGR adjustment |
| 25723 | FL5DB Beer-only MGR lifting, with UP-made wine MGR adjustment |
| 25724 | FL4A MGR lifting, with UP-made wine MGR adjustment |
| 23575 | FL4A 5 percent |
| 217411 | CL 75% / 25% |

## Not in the roster (workflow reports, add on demand)

| Code | Report |
|---|---|
| 20161 | Indent request — CL2 only |
| 20708 | Indent request — CL2, FL2, FL2B |
| 207081 | Indent request — retail |
| 20714 | MGR transfer request approval & lifting |
| 20715 | MGQ transfer request approval & lifting |
| 20797 | HBR-wise dispatch |
| 7123 | CMS challan details |

Only the FL4C MGR layout (237201) has a verified typed parser; every other
report is captured generically into `data/raw/<name>.json` until one real
export of it has been shared and its layout promoted to a typed parser.
