#!/usr/bin/env node
// GBN Excise Command Centre — read-only MCP server (stdio).
//
// Implements the tool contract from the v2 prototype:
//   get_district_summary, compare_cy_ly, list_low_performers,
//   get_shop_profile, generate_deo_brief (+ list_active_alerts).
//
// Data source is selected from the environment (see lib/datasource.js):
//   C4_DB_URL / DATABASE_URL -> monitoring PostgreSQL DB, forced read-only
//   otherwise                -> normalized JSON snapshots in ../data
//
// Credentials and portal sessions live in the collector layer only; this
// server never writes, never logs in anywhere, and never handles OTP/CAPTCHA.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createDataSource } from './lib/datasource.js';
import {
    summarizeMgr, riskOf, fmtINR, round2, normalizeMonth, lastYearMonthLabel
} from './lib/metrics.js';

const ds = createDataSource();

const server = new McpServer({ name: 'gbn-excise-mcp-server', version: '1.0.0' });

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const ok = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
});
const fail = (message) => ({
    content: [{ type: 'text', text: message }],
    isError: true
});

const circleParam = z.string().optional().describe(
    'Circle filter, e.g. "Circle - 4", "circle 4" or just "4". Omit for the whole district.');
const monthParam = z.string().optional().describe(
    'Report month, e.g. "Jul-2026" or "2026-07". Omit to use every loaded snapshot month.');

function resolveMonth(month) {
    if (!month) return { label: undefined };
    const parsed = normalizeMonth(month);
    if (!parsed) throw new Error(`Unrecognized month "${month}". Use "Jul-2026" or "2026-07".`);
    return parsed;
}

async function requireMgrRows({ circle, month }) {
    const rows = await ds.getMgrRows({ circle, month });
    if (!rows.length) {
        const info = ds.sourceInfo();
        throw new Error(
            `No MGR rows found${circle ? ` for circle "${circle}"` : ''}${month ? ` in month "${month}"` : ''}. ` +
            `Data source: ${info.mode} (${info.detail}). ` +
            `Try omitting the filters, or check that the collector has published a snapshot.`);
    }
    return rows;
}

// ---------------------------------------------------------------- tools ----

server.registerTool('get_district_summary', {
    title: 'District / Circle KPI Summary',
    description:
        'District or circle KPIs from the latest MGR lifting snapshot: total MGR assigned, ' +
        'lifted, balance, weighted achievement %, achievement distribution and the ' +
        'strongest/weakest shops. Filter by circle and/or month.',
    inputSchema: { circle: circleParam, month: monthParam },
    annotations: READ_ONLY
}, async ({ circle, month }) => {
    try {
        const m = resolveMonth(month);
        const rows = await requireMgrRows({ circle, month: m.label });
        const summary = summarizeMgr(rows);
        return ok({
            scope: { circle: circle || 'all circles', month: m.label || [...new Set(rows.map(r => r.month))].join(', ') },
            ...summary,
            data_source: ds.sourceInfo()
        });
    } catch (err) {
        return fail(err.message);
    }
});

server.registerTool('compare_cy_ly', {
    title: 'Current-Year vs Last-Year Comparison',
    description:
        'Compare current period against the matching last-year period: scope "mtd" compares ' +
        'month-to-date MGR lifting against the same month last year; scope "day" compares the ' +
        'current-day sales snapshot against the same day last year at the same cutoff. ' +
        'The comparison is only produced when both sides exist at a matching cutoff — partial ' +
        'CY data is never silently compared with a complete LY day.',
    inputSchema: {
        scope: z.enum(['mtd', 'day']).default('mtd')
            .describe('"mtd" = month-to-date MGR comparison; "day" = same-day, same-cutoff daily sales comparison'),
        circle: circleParam,
        month: monthParam,
        date: z.string().optional().describe('For scope "day": ISO date, e.g. "2026-08-03". Defaults to today.')
    },
    annotations: READ_ONLY
}, async ({ scope, circle, month, date }) => {
    try {
        if (scope === 'day') {
            const cyDay = await ds.getDailySales({ date, circle });
            if (!cyDay) {
                return ok({
                    scope: 'day', comparison_available: false,
                    reason: 'The current-day live sales feed is not connected yet. Only MGR lifting snapshots are loaded. ' +
                        'Map the daily sales report in the collector (docs/DATA_MAPPING.md items 1-2) to enable same-day CY/LY comparison.',
                    required_feeds: ['current-day live sales report', 'same-day-last-year report at matching cutoff'],
                    data_source: ds.sourceInfo()
                });
            }
            // Feed present (PG mode): LY side must exist at the same cutoff.
            const lyDate = date ? `${Number(date.slice(0, 4)) - 1}${date.slice(4)}` : undefined;
            const lyDay = await ds.getDailySales({ date: lyDate, circle });
            if (!lyDay) {
                return ok({
                    scope: 'day', comparison_available: false,
                    reason: `No last-year daily snapshot found for ${lyDate}. The engine refuses to compare a partial current day against nothing or against a mismatched cutoff.`,
                    data_source: ds.sourceInfo()
                });
            }
            const sum = (rows) => rows.reduce((a, r) => a + (Number(r.metric?.sale_value) || 0), 0);
            const cy = sum(cyDay), ly = sum(lyDay);
            return ok({
                scope: 'day', comparison_available: true, comparison_basis: 'same-cutoff',
                date, ly_date: lyDate,
                cy_sale_value: round2(cy), ly_sale_value: round2(ly),
                growth_pct: ly ? round2((cy - ly) / ly * 100) : null,
                data_source: ds.sourceInfo()
            });
        }

        // scope === 'mtd' — MGR lifting for the month vs same month last year.
        const m = resolveMonth(month);
        const cyRows = await requireMgrRows({ circle, month: m.label });
        const cyMonth = m.label || cyRows[0].month;
        const lyMonth = lastYearMonthLabel(cyMonth);
        const cySummary = summarizeMgr(cyRows);

        const lyRows = lyMonth ? await ds.getMgrRows({ circle, month: lyMonth }) : [];
        if (!lyRows.length) {
            return ok({
                scope: 'mtd', comparison_available: false,
                cy: { month: cyMonth, ...cySummary },
                reason: `No last-year snapshot for ${lyMonth} is loaded. CY figures are reported alone rather than ` +
                    'silently compared against missing data. Connect the LY-MTD report feed (docs/DATA_MAPPING.md items 3-4).',
                data_source: ds.sourceInfo()
            });
        }

        const lySummary = summarizeMgr(lyRows);
        const growth = lySummary.mgr_lifted_total
            ? round2((cySummary.mgr_lifted_total - lySummary.mgr_lifted_total) / lySummary.mgr_lifted_total * 100)
            : null;
        return ok({
            scope: 'mtd', comparison_available: true, comparison_basis: 'full-month-snapshot',
            cy: { month: cyMonth, ...cySummary },
            ly: { month: lyMonth, ...lySummary },
            lifted_growth_pct: growth,
            data_source: ds.sourceInfo()
        });
    } catch (err) {
        return fail(err.message);
    }
});

server.registerTool('list_low_performers', {
    title: 'Rank Low-Performing Shops',
    description:
        'Shops whose MGR achievement is below a threshold, ranked worst first, with risk band ' +
        '(critical <50%, watch <80%, good otherwise) and balance left to lift.',
    inputSchema: {
        threshold_pct: z.number().min(0).max(1000).default(100)
            .describe('Return shops with achievement % strictly below this value (default 100)'),
        circle: circleParam,
        month: monthParam,
        limit: z.number().int().min(1).max(200).default(50).describe('Maximum shops to return')
    },
    annotations: READ_ONLY
}, async ({ threshold_pct, circle, month, limit }) => {
    try {
        const m = resolveMonth(month);
        const rows = await requireMgrRows({ circle, month: m.label });
        const below = rows
            .filter(r => (r.achievement ?? 0) < threshold_pct)
            .sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0))
            .slice(0, limit)
            .map(r => ({
                shop_id: r.shop_id, shop_name: r.shop_name, circle: r.circle, month: r.month,
                license_type: r.license_type,
                mgr_assigned: r.mgr_assigned, mgr_lifted: r.mgr_lifted, balance: r.balance,
                achievement_pct: r.achievement, risk: riskOf(r.achievement)
            }));
        return ok({
            threshold_pct,
            scope: { circle: circle || 'all circles', month: m.label || 'all loaded months' },
            matched: below.length,
            total_shops_examined: rows.length,
            shops: below,
            data_source: ds.sourceInfo()
        });
    } catch (err) {
        return fail(err.message);
    }
});

server.registerTool('get_shop_profile', {
    title: 'Shop Profile',
    description:
        'Everything known about one shop: identity, MGR assignment/lifting/achievement per loaded ' +
        'month, risk band, and open alerts. Shop ID matching is case-insensitive; a partial ' +
        'shop name also works.',
    inputSchema: {
        shop_id: z.string().min(1).describe('Shop ID (e.g. "PR_41", "RETAIL814855") or a partial shop name (e.g. "Liquor Town")')
    },
    annotations: READ_ONLY
}, async ({ shop_id }) => {
    try {
        const rows = await ds.getMgrRows({});
        const q = shop_id.toLowerCase();
        let matches = rows.filter(r => String(r.shop_id).toLowerCase() === q);
        if (!matches.length) matches = rows.filter(r =>
            String(r.shop_id).toLowerCase().includes(q) || String(r.shop_name).toLowerCase().includes(q));

        if (!matches.length) {
            const known = [...new Set(rows.map(r => `${r.shop_id} (${r.shop_name})`))];
            return fail(`No shop matches "${shop_id}". Known shops: ${known.join(', ') || 'none loaded'}.`);
        }
        const distinctIds = [...new Set(matches.map(r => r.shop_id))];
        if (distinctIds.length > 1) {
            return fail(`"${shop_id}" is ambiguous — it matches: ${distinctIds.join(', ')}. Pass one exact shop_id.`);
        }

        const first = matches[0];
        const { alerts } = await ds.getAlerts({ shopId: first.shop_id });
        return ok({
            shop_id: first.shop_id,
            shop_name: first.shop_name,
            district: first.district,
            circle: first.circle,
            license_type: first.license_type,
            mgr_history: matches.map(r => ({
                month: r.month,
                mgr_assigned: r.mgr_assigned, final_required: r.final_required,
                mgr_lifted: r.mgr_lifted, balance: r.balance,
                achievement_pct: r.achievement, risk: riskOf(r.achievement)
            })),
            open_alerts: alerts,
            data_source: ds.sourceInfo()
        });
    } catch (err) {
        return fail(err.message);
    }
});

server.registerTool('list_active_alerts', {
    title: 'Active Alerts',
    description:
        'Open rule-based alerts (critical / watch) for the district or one circle. When no alerts ' +
        'table is connected, alerts are derived live from MGR pace rules and marked derived:true.',
    inputSchema: {
        circle: circleParam,
        severity: z.enum(['critical', 'watch']).optional().describe('Filter by severity')
    },
    annotations: READ_ONLY
}, async ({ circle, severity }) => {
    try {
        const { alerts, derived } = await ds.getAlerts({ circle });
        const filtered = severity ? alerts.filter(a => a.severity === severity) : alerts;
        return ok({
            count: filtered.length,
            derived_from_rules: derived,
            alerts: filtered,
            data_source: ds.sourceInfo()
        });
    } catch (err) {
        return fail(err.message);
    }
});

server.registerTool('generate_deo_brief', {
    title: 'Generate DEO Briefing',
    description:
        'Concise Markdown briefing for the District Excise Officer built strictly from verified ' +
        'database metrics: headline KPIs, laggard and over-achiever shops, open alerts, and an ' +
        'explicit note on any feed that is not yet connected. Nothing is estimated or invented.',
    inputSchema: {
        circle: circleParam,
        month: monthParam,
        top_n: z.number().int().min(1).max(20).default(5).describe('How many laggards / top performers to name')
    },
    annotations: READ_ONLY
}, async ({ circle, month, top_n }) => {
    try {
        const m = resolveMonth(month);
        const rows = await requireMgrRows({ circle, month: m.label });
        const s = summarizeMgr(rows);
        const monthLabel = m.label || [...new Set(rows.map(r => r.month))].join(', ');
        const scopeLabel = circle ? `Circle ${String(circle).replace(/circle/i, '').replace(/[^0-9a-zA-Z]/g, '') || circle}` : 'District (all circles)';

        const sorted = [...rows].sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0));
        const laggards = sorted.filter(r => (r.achievement ?? 0) < 100).slice(0, top_n);
        const achievers = sorted.filter(r => (r.achievement ?? 0) >= 100).reverse().slice(0, top_n);
        const { alerts } = await ds.getAlerts({ circle });
        const critical = alerts.filter(a => a.severity === 'critical');

        const lyMonth = lastYearMonthLabel(monthLabel.split(',')[0].trim());
        const lyRows = lyMonth ? await ds.getMgrRows({ circle, month: lyMonth }) : [];

        const lines = [];
        lines.push(`# DEO Brief — ${scopeLabel}, ${monthLabel}`);
        lines.push('');
        lines.push(`**Shops reporting:** ${s.shop_count} · **MGR assigned:** ${fmtINR(s.mgr_assigned_total)} · ` +
            `**Lifted:** ${fmtINR(s.mgr_lifted_total)} · **Balance:** ${fmtINR(s.balance_total)} · ` +
            `**Weighted achievement:** ${s.achievement_pct != null ? s.achievement_pct.toFixed(1) + '%' : '—'}`);
        lines.push('');
        if (critical.length) {
            lines.push(`## ⚠ Critical (${critical.length})`);
            for (const a of critical) lines.push(`- ${a.message}`);
            lines.push('');
        }
        if (laggards.length) {
            lines.push(`## Shops below 100% MGR (worst ${laggards.length})`);
            for (const r of laggards) {
                lines.push(`- **${r.shop_name}** (${r.shop_id}) — ${round2(r.achievement)}% lifted, balance ${fmtINR(r.balance)}`);
            }
            lines.push('');
        }
        if (achievers.length) {
            lines.push(`## Exceeding MGR (top ${achievers.length})`);
            for (const r of achievers) {
                lines.push(`- **${r.shop_name}** (${r.shop_id}) — ${round2(r.achievement)}% (${fmtINR(-1 * (r.balance ?? 0))} over)`);
            }
            lines.push('');
        }
        lines.push('## Data status');
        if (lyRows.length) {
            const lyS = summarizeMgr(lyRows);
            const growth = lyS.mgr_lifted_total
                ? round2((s.mgr_lifted_total - lyS.mgr_lifted_total) / lyS.mgr_lifted_total * 100) : null;
            lines.push(`- YoY: lifted ${fmtINR(s.mgr_lifted_total)} vs ${fmtINR(lyS.mgr_lifted_total)} in ${lyMonth}` +
                (growth != null ? ` (**${growth > 0 ? '+' : ''}${growth}%**)` : ''));
        } else {
            lines.push(`- Last-year feed (${lyMonth || 'LY'}) not connected — YoY comparison intentionally omitted.`);
        }
        const info = ds.sourceInfo();
        lines.push(`- Source: ${info.mode === 'postgres' ? 'monitoring database (read-only)' : `snapshot ${info.snapshots?.map(x => x.source).join(', ')}`}`);
        lines.push('');
        lines.push('_All figures are read directly from verified report snapshots; no values are estimated._');

        const brief = lines.join('\n');
        return {
            content: [{ type: 'text', text: brief }],
            structuredContent: { brief_markdown: brief, kpis: s, scope: { circle: circle || 'all', month: monthLabel } }
        };
    } catch (err) {
        return fail(err.message);
    }
});

// ----------------------------------------------------------------- main ----

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`gbn-excise-mcp-server running (stdio) — data source: ${ds.sourceInfo().mode}`);
}

const shutdown = async () => { try { await ds.close(); } finally { process.exit(0); } };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
